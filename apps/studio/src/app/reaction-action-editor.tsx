'use client';
import { createPortal } from 'react-dom';
import { Modal } from './modal';
import { EditorViewSwitch } from '../components/ui/editor-view-switch';
import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { JsonSchema, PureFunctionManifest } from '@form-engine/protocol/capability';
import type { Expression, ReactionAction } from '@form-engine/protocol/definition';
import { FieldPicker, fieldsFromReactionFields } from '../components/field-picker';
import { JsonEditor } from '../components/json/json-editor';
import type { JsonNode } from '../components/json/model';
import { Button, Input } from '../components/ui';
import { StudioSelect } from '../components/ui/select';
import { ExpressionEditor } from './expression-editor';
import type { FunctionDocumentation } from './function-catalog';
import type { ExpressionVerificationContext } from './expression-verification';
import { valueAsExpression } from './reaction-expression-model';
import {
  isReactionWatch,
  scopeBinders,
  watchIdentity,
  type ReactionField,
} from './reaction-fields';
import { appendItems, readAction, removeItem, reorder } from './reaction-model';
import { child, semanticModel, type Model } from './semantic-model';
import './action-editor.css';

export const actionTypes = {
  set: ['设置字段'],
  patch: ['更新对象'],
  remove: ['删除属性'],
  'array.insert': ['插入成员'],
  'array.remove': ['移除成员'],
  'array.move': ['移动成员'],
  'host.emit': ['通知宿主'],
  batch: ['批量命令'],
} as const;
export type ActionKind = keyof typeof actionTypes;
export function actionKind(action: ReactionAction): ActionKind {
  return 'type' in action ? action.type : action.op;
}
type Context = {
  onInvalidDraft?: (id: string, invalid: boolean) => void;
  fields: ReactionField[];
  scope?: unknown;
  manifests: PureFunctionManifest[];
  named?: Record<string, Expression>;
  verification?: ExpressionVerificationContext;
  functionDocs?: ReadonlyMap<string, FunctionDocumentation>;
};
function emptyAction(kind: ActionKind) {
  if (kind === 'batch') return '{"op":"batch","commands":[]}';
  if (kind === 'patch') return '{"op":"patch","value":{}}';
  if (kind === 'host.emit') return '{"type":"host.emit","event":""}';
  return JSON.stringify(
    kind === 'set' || kind === 'array.insert' ? { op: kind, value: null } : { op: kind },
  );
}
function KindSelect({
  value,
  change,
  command = false,
  label = '动作类型',
}: {
  value: ActionKind;
  change: (k: ActionKind) => void;
  command?: boolean;
  label?: string;
}) {
  return (
    <label>
      {label}
      <StudioSelect
        aria-label={label}
        value={value}
        onValueChange={(next) => change(next as ActionKind)}
      >
        {Object.entries(actionTypes)
          .filter(([key]) => !command || key !== 'host.emit')
          .map(([key, [title]]) => (
            <option key={key} value={key}>
              {title}
            </option>
          ))}
      </StudioSelect>
    </label>
  );
}
function ValueEditor({
  raw,
  label,
  expected,
  context,
  change,
}: {
  raw: string;
  label: string;
  expected?: JsonSchema;
  context: Context;
  change: (raw: string) => void;
}) {
  let expression: string;
  try {
    expression = valueAsExpression(raw);
  } catch {
    // A legacy composite ValueSpec can contain independently evaluated children.
    const m = semanticModel(raw);
    return (
      <fieldset>
        <legend>{label}</legend>
        {m.root.children?.map((entry, i) => (
          <ValueEditor
            key={entry.path}
            label={entry.key ?? String(i + 1)}
            raw={m.raw(entry)}
            context={context}
            change={(v) => change(m.replace(entry, v))}
          />
        ))}
      </fieldset>
    );
  }
  return (
    <ExpressionEditor
      {...context}
      label={label}
      raw={expression}
      expected={expected}
      advisory
      onChange={(v) => change('{"$expr":' + v + '}')}
    />
  );
}
type BodyProps = {
  model: Model;
  node: JsonNode;
  context: Context;
  change: (raw: string) => void;
  command?: boolean;
  original?: string;
};
function ActionFields({ model: m, node, context, change, command, original }: BodyProps) {
  const kind = (m.str(child(node, 'op')) ?? m.str(child(node, 'type'))) as ActionKind;
  const [property, setProperty] = useState('');
  const [subKind, setSubKind] = useState<ActionKind>('set');
  const [listVersion, resetList] = useState(0);
  const target = child(node, 'target'),
    candidate = target && JSON.parse(m.raw(target));
  const ref = isReactionWatch(candidate) && candidate.source === 'data' ? candidate : null;
  const field = ref
    ? context.fields.find((f) => watchIdentity(f.ref) === watchIdentity(ref))
    : undefined;
  const schema = field?.schema as JsonSchema | undefined;
  const array = kind.startsWith('array.');
  const schemaByRef = new Map(context.fields.map((f) => [watchIdentity(f.ref), f.schema]));
  const pickerFields = context.fields.map((f) => {
    if (f.title || !f.ref.path) return f;
    const key = f.ref.path
      .slice(f.ref.path.lastIndexOf('/') + 1)
      .replace(/~1/g, '/')
      .replace(/~0/g, '~');
    return { ...f, title: key };
  });
  const fields = fieldsFromReactionFields(pickerFields, (f) => {
    const shape = schemaByRef.get(watchIdentity(f.ref)) as JsonSchema | undefined;
    const required = array ? 'array' : kind === 'patch' ? 'object' : undefined;
    if (
      required &&
      typeof shape === 'object' &&
      shape.type &&
      !(Array.isArray(shape.type) ? shape.type : [shape.type]).includes(required)
    )
      return '目标需要是' + (array ? '数组' : '对象');
    if (kind === 'remove' && !f.ref.path) return '不能移除根位置';
  });
  const aliases = scopeBinders(context.scope)
    .filter((b) => ref && b.mode === 'each' && watchIdentity(b.from) === watchIdentity(ref))
    .map((b) => b.as);
  const item = m.str(child(child(node, 'item'), '$scope')) ?? '';
  const position = child(node, 'position'),
    pos = m.str(child(position, 'kind')) ?? '';
  const anchor = m.str(child(child(position, 'item'), '$scope')) ?? '';
  const key = kind === 'host.emit' ? 'payload' : 'value',
    value = child(node, key),
    commands = child(node, 'commands');
  const items = commands?.children ?? [];
  function write(name: string, v: string) {
    change(m.property(node, name, v));
  }
  function memberSelect(
    label: string,
    current: string,
    options: string[],
    select: (s: string) => void,
  ) {
    return (
      <label>
        {label}
        <StudioSelect aria-label={label} value={current} onValueChange={select}>
          <option value="" disabled>
            选择作用域成员
          </option>
          {current && !options.includes(current) && (
            <option value={current} disabled>
              已配置 · {current}
            </option>
          )}
          {options.map((alias) => (
            <option key={alias} value={alias}>
              {alias}
            </option>
          ))}
        </StudioSelect>
      </label>
    );
  }
  return (
    <div className="studio-action-fields">
      <div className="studio-action-target-row">
        <KindSelect
          value={kind}
          command={command}
          change={(k) => {
            const previous = original && semanticModel(original);
            change(m.replace(node, previous && mKind(previous) === k ? original! : emptyAction(k)));
          }}
        />
        {kind !== 'batch' && kind !== 'host.emit' && (
          <div className="studio-action-target">
            <span>{array ? '目标数组' : '目标字段'}</span>
            <FieldPicker
              label={array ? '选择目标数组' : '选择目标字段'}
              fields={fields}
              value={ref}
              description={field?.title}
              onChange={(next) => write('target', JSON.stringify(next))}
            />
            {ref && (
              <small>
                {field
                  ? field.title || field.label
                  : '已配置 · ' + (ref.scope ?? '表单根') + ' ' + ref.path}
              </small>
            )}
          </div>
        )}
      </div>
      {kind === 'host.emit' && (
        <label>
          事件名
          <Input
            value={m.str(child(node, 'event')) ?? ''}
            onValueChange={(next) => write('event', JSON.stringify(next))}
          />
        </label>
      )}
      {(kind === 'array.move' || kind === 'array.remove') &&
        memberSelect(kind === 'array.move' ? '被移动的成员' : '被移除的成员', item, aliases, (s) =>
          write('item', JSON.stringify({ $scope: s })),
        )}
      {(kind === 'array.insert' || kind === 'array.move') && (
        <>
          <label>
            目的位置
            <StudioSelect
              aria-label="目的位置"
              value={pos}
              onValueChange={(k) =>
                write(
                  'position',
                  JSON.stringify(k === 'index' ? { kind: k, index: 0 } : { kind: k }),
                )
              }
            >
              <option value="" disabled>
                选择目的位置
              </option>
              <option value="index">指定下标</option>
              <option value="before">成员之前</option>
              <option value="after">成员之后</option>
            </StudioSelect>
          </label>
          {pos === 'index' && (
            <label>
              下标（从 0 开始）
              <Input
                type="number"
                min={0}
                step={1}
                value={child(position, 'index') ? m.raw(child(position, 'index')!) : ''}
                onValueChange={(v) =>
                  write(
                    'position',
                    JSON.stringify(v === '' ? { kind: pos } : { kind: pos, index: Number(v) }),
                  )
                }
              />
            </label>
          )}
          {(pos === 'before' || pos === 'after') &&
            memberSelect(
              '参照成员',
              anchor,
              aliases.filter((a) => a !== item),
              (s) => write('position', JSON.stringify({ kind: pos, item: { $scope: s } })),
            )}
        </>
      )}
      {(kind === 'set' || kind === 'array.insert' || kind === 'host.emit') && (
        <>
          {value || kind !== 'host.emit' ? (
            <ValueEditor
              context={context}
              label={kind === 'set' ? '写入值' : array ? '新成员' : '消息内容'}
              raw={value ? m.raw(value) : 'null'}
              expected={array && typeof schema === 'object' ? (schema.items as JsonSchema) : schema}
              change={(v) => write(key, v)}
            />
          ) : (
            <Button variant="secondary" onClick={() => write(key, 'null')}>
              添加消息内容
            </Button>
          )}
          {kind === 'host.emit' && value && (
            <Button variant="text" onClick={() => change(removeItem(m.raw(m.root), value))}>
              移除消息内容
            </Button>
          )}
        </>
      )}
      {kind === 'patch' && (
        <>
          {value?.children?.map((entry) => (
            <fieldset key={entry.path}>
              <ValueEditor
                label={entry.key!}
                context={context}
                raw={m.raw(entry)}
                change={(v) => change(m.replace(entry, v))}
              />
              <Button variant="text" onClick={() => change(removeItem(m.raw(m.root), entry))}>
                移除属性
              </Button>
            </fieldset>
          ))}
          <label>
            属性名
            <Input value={property} onValueChange={setProperty} />
          </label>
          <Button
            variant="secondary"
            disabled={!property.trim() || !!child(value, property.trim())}
            onClick={() => {
              const k = property.trim();
              change(
                value
                  ? m.property(value, k, 'null')
                  : m.property(node, 'value', JSON.stringify({ [k]: null })),
              );
              setProperty('');
            }}
          >
            添加属性
          </Button>
        </>
      )}
      {kind === 'batch' && (
        <>
          {items.map((entry, i) => {
            const sub = m.str(child(entry, 'op')) as ActionKind;
            return (
              <details key={listVersion + ':' + i}>
                <summary>
                  {i + 1}. {actionTypes[sub]?.[0] ?? '子命令'}
                </summary>
                <ActionFields
                  key={sub}
                  model={m}
                  node={entry}
                  context={context}
                  command
                  change={change}
                />
                <Button
                  variant="text"
                  disabled={!i}
                  onClick={() => {
                    resetList((v) => v + 1);
                    change(reorder(m, commands!, i, i - 1));
                  }}
                >
                  上移
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    resetList((v) => v + 1);
                    change(removeItem(m.raw(m.root), entry));
                  }}
                >
                  移除子命令
                </Button>
              </details>
            );
          })}
          <KindSelect label="子命令类型" value={subKind} change={setSubKind} command />
          <Button
            variant="secondary"
            onClick={() =>
              change(
                commands
                  ? appendItems(m, commands, [emptyAction(subKind)])
                  : m.property(node, 'commands', '[' + emptyAction(subKind) + ']'),
              )
            }
          >
            添加子命令
          </Button>
        </>
      )}
    </div>
  );
}

export function ActionEditor({
  initial,
  kind = 'set',
  onApply,
  onPending,
  discard,
  returnFocus,
  children,
  ...context
}: Context & {
  initial?: string;
  kind?: ActionKind;
  onApply: (raw: string, isCurrent: () => boolean) => Promise<void>;
  onPending: (pending: boolean) => void;
  discard: () => void;
  returnFocus?: HTMLElement;
  children?: ReactNode;
}) {
  const base = initial ?? emptyAction(kind);
  const [raw, setRaw] = useState(base),
    [advanced, setAdvanced] = useState(false),
    [busy, setBusy] = useState(false),
    [error, fail] = useState('');
  const [invalidDrafts, setInvalidDrafts] = useState<Set<string>>(() => new Set());
  const onInvalidDraft = useCallback((id: string, invalid: boolean) => {
    setInvalidDrafts((previous) => {
      const next = new Set(previous);
      if (invalid) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const active = useRef(true),
    dirty = initial === undefined || raw !== base;
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useLayoutEffect(() => {
    onPending(dirty || busy || invalidDrafts.size > 0);
    return () => onPending(false);
  }, [onPending, dirty, busy, invalidDrafts]);
  const model = advanced ? undefined : semanticModel(raw);
  function change(next: string) {
    setRaw(next);
    fail('');
  }
  function visual() {
    try {
      readAction(raw);
      setAdvanced(false);
      fail('');
    } catch (e) {
      fail(e instanceof Error ? e.message : '动作 JSON 无效');
    }
  }
  async function apply() {
    if (busy || !dirty) return;
    setBusy(true);
    fail('');
    try {
      readAction(raw);
      await onApply(raw, () => active.current);
    } catch (e) {
      if (active.current) fail(e instanceof Error ? e.message : '无法应用动作');
    } finally {
      if (active.current) setBusy(false);
    }
  }
  return createPortal(
    <Modal
      title={initial === undefined ? '添加动作' : '编辑动作'}
      className="reaction-action-dialog"
      size="wide"
      closeLabel="取消"
      closeDisabled={busy}
      onClose={discard}
      returnFocus={returnFocus}
      toolbar={
        <div className="reaction-action-view-bar">
          <EditorViewSwitch
            value={advanced ? 'json' : 'form'}
            formDisabled={busy}
            jsonDisabled={busy || invalidDrafts.size > 0}
            onChange={(view) => (view === 'form' ? visual() : setAdvanced(true))}
          />
        </div>
      }
      actions={
        <Button disabled={!dirty || busy || invalidDrafts.size > 0} onClick={apply}>
          {busy ? '正在检查…' : '应用动作'}
        </Button>
      }
    >
      <fieldset className="studio-action-editor" disabled={busy}>
        {model && (
          <ActionFields
            key={mKind(model)}
            model={model}
            node={model.root}
            original={initial}
            context={{ ...context, onInvalidDraft }}
            change={change}
          />
        )}
        {advanced && (
          <JsonEditor
            initialMode="text"
            label="动作 JSON"
            readOnly={false}
            text={raw}
            onChange={change}
          />
        )}
        {!advanced && !dirty && children}
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </Modal>,
    returnFocus?.closest('main') ?? document.querySelector('main') ?? document.body,
  );
}

function mKind(m: Model) {
  return m.str(child(m.root, 'op')) ?? m.str(child(m.root, 'type'));
}
