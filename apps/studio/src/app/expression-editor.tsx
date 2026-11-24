'use client';

import { EditorViewSwitch, type EditorView } from '../components/ui/editor-view-switch';
import { JsonEditor } from '../components/json/json-editor';
import {
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Button, Icon, IconButton, Select, Tooltip } from '../components/ui';
import { FieldPicker, fieldsFromReactionFields } from '../components/field-picker';
import { possibleBinding } from './possible-binding';
import { expressionLabel, ExpressionDisplay } from './expression-display';
import { StudioSelect } from '../components/ui/select';
import type { Expression, ReactionWatch } from '@form-engine/protocol/definition';
import type { PureFunctionManifest } from '@form-engine/protocol/capability';
import { child, semanticModel } from './semantic-model';
import { removeLayoutMember } from './layout-token-edit';
import type { JsonSchema } from '@form-engine/protocol';
import { defaultLiteral } from './manifest-input';
import { LiteralValueEditor, literalSource, readLiteral } from './literal-value-editor';
import { Modal } from './modal';
import { functionTitle, type FunctionDocumentation } from './function-catalog';
import {
  ArgumentHelp,
  getParameterHelp,
  FunctionHelp,
  parameterTitle,
  parameterMeaning,
  type ParameterHelp,
} from './expression-function-help';
import { ReactionFieldPicker } from './reaction-fields-ui';
import {
  comparisonLabels,
  groupOf,
  type ExpressionVerificationContext,
} from './expression-verification';
import { ExpressionVerificationPanel } from './expression-verification-panel';
import './expression-editor.css';
import {
  checkReactionExpression,
  expressionLiteral,
  expressionSchemaName,
  readExpression,
  type ReactionExpressionContext,
} from './reaction-expression-model';

export { validateReactionExpression } from './reaction-expression-model';

function defaultArgument(schema: JsonSchema): string {
  return expressionLiteral(defaultLiteral(schema));
}
function startCall(manifest: PureFunctionManifest): string {
  const args = manifest.parameters.filter((p) => !p.optional).map((p) => defaultArgument(p.schema));
  return '{"op":' + JSON.stringify(manifest.id) + ',"args":[' + args.join(',') + ']}';
}

type Props = ReactionExpressionContext & {
  label: string;
  raw: string;
  onChange: (raw: string) => void;
  allowValidation?: boolean;
  functionDocs?: ReadonlyMap<string, FunctionDocumentation>;
  verification?: ExpressionVerificationContext;
  onInvalidDraft?: (id: string, invalid: boolean) => void;
  showLabel?: boolean;
};

type DialogOptions = {
  title: string;
  onClose: () => void;
  onApply: () => void;
  busy?: boolean;
  action?: string;
  error?: string;
  notice?: ReactNode;
};

function ExpressionDialogFrame({
  title,
  onClose,
  onApply,
  busy,
  action = '应用表达式',
  error,
  disabled,
  children,
}: DialogOptions & { disabled?: boolean; children: ReactNode }) {
  return (
    <Modal
      title={title}
      size="wide"
      className="expression-dialog"
      onClose={onClose}
      closeDisabled={busy}
      actions={
        <Button disabled={busy || disabled} onClick={onApply}>
          {action}
        </Button>
      }
    >
      <fieldset className="expression-dialog-body" disabled={busy}>
        {children}
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </Modal>
  );
}

export function ExpressionEditorDialog({
  title,
  onClose,
  onApply,
  busy,
  action,
  error,
  notice,
  ...editor
}: Omit<Props, 'showLabel' | 'onInvalidDraft'> & DialogOptions) {
  const [invalid, setInvalid] = useState(false);
  const report = useCallback((_: string, value: boolean) => setInvalid(value), []);
  return (
    <ExpressionDialogFrame {...{ title, onClose, onApply, busy, action, error }} disabled={invalid}>
      {notice}
      <ExpressionEditor {...editor} showLabel={false} onInvalidDraft={report} />
    </ExpressionDialogFrame>
  );
}

function ExpressionText({
  raw,
  label,
  onChange,
  close,
}: Pick<Props, 'raw' | 'label' | 'onChange'> & { close: () => void }) {
  const [text, set] = useState(raw);
  const [error, fail] = useState('');
  const title = label + ' · 表达式 JSON';
  function apply() {
    try {
      readExpression(text);
      onChange(text);
      close();
    } catch (e) {
      fail(e instanceof Error ? e.message : '无效 JSON');
    }
  }
  return (
    <ExpressionDialogFrame title={title} onClose={close} onApply={apply} error={error}>
      <JsonEditor
        size="compact"
        initialMode="text"
        label={title}
        text={text}
        readOnly={false}
        onChange={set}
      />
    </ExpressionDialogFrame>
  );
}

export function ExpressionEditor(props: Props) {
  const id = useId();
  const [verificationTrigger, setVerificationTrigger] = useState<HTMLButtonElement>();
  const [view, setView] = useState<EditorView>('form');
  const [collapsed, setCollapsed] = useState(false);
  const [invalid, setInvalid] = useState<{ text: string; error: string }>();
  const notify = props.onInvalidDraft;
  const hasInvalidDraft = Boolean(invalid);
  useLayoutEffect(() => {
    if (!hasInvalidDraft || !notify) return;
    notify(id, true);
    return () => notify(id, false);
  }, [id, hasInvalidDraft, notify]);
  function editJson(text: string) {
    try {
      readExpression(text);
    } catch (e) {
      setInvalid({ text, error: e instanceof Error ? e.message : '表达式 JSON 无效' });
      return;
    }
    setInvalid(undefined);
    props.onChange(text);
  }
  let expr: Expression | undefined;
  try {
    expr = readExpression(props.raw);
  } catch {
    // The editor retains raw input and exposes the JSON repair entry.
  }
  return (
    <div className="expression-workspace">
      <section className="expression-value-group" aria-label={props.label}>
        {props.showLabel !== false && <strong>{props.label}</strong>}
        <div className="expression-value-panel">
          <div className="expression-value-toolbar">
            <Button
              variant="text"
              aria-expanded={!collapsed}
              disabled={!!invalid}
              onClick={() => setCollapsed(!collapsed)}
            >
              <Icon name={collapsed ? 'ChevronRight' : 'ChevronDown'} />
              表达式
            </Button>
            {!collapsed && (
              <EditorViewSwitch value={view} onChange={setView} formDisabled={!!invalid} />
            )}
            {props.verification && (
              <Button
                variant="secondary"
                aria-haspopup="dialog"
                aria-label={props.label + '：验证表达式'}
                disabled={expr === undefined || !!invalid}
                onClick={(event) => setVerificationTrigger(event.currentTarget)}
              >
                验证表达式
              </Button>
            )}
          </div>
          {collapsed && expr !== undefined ? (
            <ExpressionDisplay {...props} expr={expr} />
          ) : view === 'json' ? (
            <>
              <JsonEditor
                label={props.label + ' · 表达式 JSON'}
                initialMode="text"
                size="compact"
                readOnly={false}
                text={invalid?.text ?? props.raw}
                onChange={editJson}
              />
              {invalid && <p role="alert">{invalid.error}</p>}
            </>
          ) : (
            <ExpressionField {...props} id={id} path="root" depth={0} />
          )}
        </div>
      </section>
      {props.verification && verificationTrigger && (
        <ExpressionVerificationPanel
          config={props.verification}
          dialog={{
            title: '验证表达式 · ' + props.label,
            returnFocus: verificationTrigger,
            onClose: () => setVerificationTrigger(undefined),
          }}
          expected={props.expected ?? true}
          expr={expr}
          raw={props.raw}
          fields={props.fields}
          manifests={props.manifests}
          functionDocs={props.functionDocs}
          named={props.named}
        />
      )}
    </div>
  );
}

function InfoTip({ label, text, onClick }: { label: string; text: string; onClick?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement>();
  return (
    <Tooltip.Root
      onOpenChange={(open) => {
        if (open)
          setContainer(
            ref.current?.closest<HTMLElement>('dialog, [role="dialog"]') ?? document.body,
          );
      }}
    >
      <Tooltip.Trigger
        ref={ref}
        delay={200}
        render={<IconButton icon="Info" aria-label={label} onClick={onClick} />}
      />
      <Tooltip.Portal container={container}>
        <Tooltip.Positioner side="bottom" align="end" sideOffset={4}>
          <Tooltip.Popup role="tooltip" className="expression-help-bubble">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function FunctionSelect({
  label,
  value,
  manifests,
  docs,
  choose,
}: {
  label: string;
  value: string;
  manifests: PureFunctionManifest[];
  docs?: ReadonlyMap<string, FunctionDocumentation>;
  choose: (manifest: PureFunctionManifest) => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLElement>();
  const groups = new Map<string, PureFunctionManifest[]>();
  for (const f of manifests) {
    const group = ['core.and', 'core.or', 'core.not', 'core.if'].includes(f.id)
      ? '逻辑组合'
      : Object.hasOwn(comparisonLabels, f.id) || f.id === 'core.exists'
        ? '比较与判断'
        : docs?.get(f.id)?.category || (f.id.startsWith('core.') ? '基础运算' : '其他');
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group)!.push(f);
  }
  const text = (f: PureFunctionManifest) => functionTitle(f.id, docs?.get(f.id));
  const current = manifests.find((f) => f.id === value);
  return (
    <Select.Root
      modal={false}
      value={value || null}
      items={manifests.map((f) => ({ value: f.id, label: text(f) }))}
      onOpenChange={(open) => {
        if (open) setContainer(trigger.current?.closest('dialog') ?? document.body);
      }}
      onValueChange={(id) => {
        const f = manifests.find((f) => f.id === id);
        if (f) choose(f);
      }}
    >
      <Select.Trigger ref={trigger} aria-label={label} className="studio-select-trigger">
        <Select.Value>{() => (current ? text(current) : value || '选择函数')}</Select.Value>
        <Select.Icon />
      </Select.Trigger>
      <Select.Portal container={container}>
        <Select.Positioner className="studio-select-positioner" alignItemWithTrigger={false}>
          <Select.Popup className="studio-select-popup">
            <Select.List>
              {[...groups].map(([group, items]) => (
                <Select.Group key={group}>
                  <Select.GroupLabel>{group}</Select.GroupLabel>
                  {items.map((f) => (
                    <Select.Item
                      className="studio-select-item"
                      key={f.id}
                      value={f.id}
                      label={text(f)}
                    >
                      <Select.ItemText>{text(f)}</Select.ItemText>
                      <Select.ItemIndicator />
                    </Select.Item>
                  ))}
                </Select.Group>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}

function ExpressionField(
  props: Props & {
    id: string;
    path: string;
    depth: number;
    inParameter?: boolean;
    parameterHelp?: ParameterHelp;
  },
) {
  const {
    label,
    raw,
    onChange,
    manifests,
    fields,
    named,
    id,
    path,
    depth,
    expected = true,
  } = props;
  const [detailTrigger, setDetailTrigger] = useState<HTMLButtonElement>();
  const [editing, edit] = useState<'fields' | 'json' | 'help' | 'definition'>();
  let expr: Expression | undefined;
  let warning: string | undefined;
  try {
    expr = readExpression(raw);
    warning = checkReactionExpression(raw, props);
  } catch (e) {
    warning = e instanceof Error ? e.message : '表达式无效。';
  }
  const obj = expr && typeof expr === 'object' ? expr : undefined;
  const call = obj && 'op' in obj ? obj : undefined;
  const fn = call && manifests.find((f) => f.id === call.op);
  const ref = obj && 'ref' in obj ? obj.ref : undefined;
  const selected: ReactionWatch[] =
    ref && (ref.source === 'data' || ref.source === 'validation') ? [ref] : [];
  const m = expr === undefined ? undefined : semanticModel(raw);
  const args = child(m?.root, 'args');
  const children = args?.children ?? [];
  const nextParam = fn?.parameters[children.length] ?? fn?.restParameter;
  const combo = Boolean(groupOf(expr));
  const [expanded, setExpanded] = useState(depth === 0);
  const folded = Boolean(call && !expanded);
  const [selecting, setSelecting] = useState<'function' | 'named' | 'field'>();
  const source = call ? 'function' : ref ? 'field' : obj && 'use' in obj ? 'named' : 'literal';
  const mode = selecting ?? source;
  const dataOnly = props.allowValidation === false;
  const tree = useMemo(
    () =>
      dataOnly && mode === 'field'
        ? fieldsFromReactionFields(
            fields.map((f) => ({
              ...f,
              title:
                f.title ||
                f.description ||
                f.ref.path.split('/').pop()?.replace(/~1/g, '/').replace(/~0/g, '~'),
            })),
          )
        : [],
    [dataOnly, fields, mode],
  );
  const available = manifests.filter(
    (f) => f.id === call?.op || props.advisory || possibleBinding(expected, f.returns),
  );
  const lit = child(m?.root, 'literal');
  const literalText =
    lit && m ? m.raw(lit) : expr !== undefined && !obj ? raw : defaultLiteral(expected);
  const close = () => edit(undefined);
  const literalInput = (
    <LiteralValueEditor
      label={label + '固定值'}
      value={readLiteral(literalText)}
      allowTypeChange
      numeric={{ integer: typeof expected === 'object' && expected.type === 'integer' }}
      onChange={(value) => {
        try {
          const next = literalSource(value);
          onChange(lit && m ? m.replace(lit, next) : expressionLiteral(next));
        } catch {
          // Keep the expression valid while a number is being entered.
        }
      }}
    />
  );
  const comparison = call && Object.hasOwn(comparisonLabels, call.op);

  function chooseFunction(manifest: PureFunctionManifest) {
    if (manifest.id === call?.op) return;
    setExpanded(true);
    if (combo && (manifest.id === 'core.and' || manifest.id === 'core.or') && m) {
      onChange(m.property(m.root, 'op', JSON.stringify(manifest.id)));
    } else if (
      call &&
      m &&
      Object.hasOwn(comparisonLabels, call.op) &&
      Object.hasOwn(comparisonLabels, manifest.id)
    ) {
      onChange(m.property(m.root, 'op', JSON.stringify(manifest.id)));
    } else onChange(startCall(manifest));
  }
  const selectors = (
    <div className="reaction-expression-selectors">
      <StudioSelect
        aria-label={label + '取值来源'}
        value={mode}
        onValueChange={(v) => {
          if (v === 'field' && dataOnly) {
            setSelecting('field');
          } else if (v === 'literal') {
            setSelecting(undefined);
            onChange(expressionLiteral(defaultLiteral(expected)));
          } else if (v === 'field') {
            setSelecting(undefined);
            edit('fields');
          } else if (v === 'named' || v === 'function') {
            setExpanded(true);
            setSelecting(v);
          }
        }}
      >
        <option value="literal">固定值</option>
        <option value="field">读取字段</option>
        <option value="function">函数结果</option>
        <option value="named" disabled={!named || !Object.keys(named).length}>
          具名表达式
        </option>
      </StudioSelect>
      {mode === 'function' && (
        <FunctionSelect
          label={label + '纯函数'}
          value={call?.op ?? ''}
          manifests={available}
          docs={props.functionDocs}
          choose={(chosen) => {
            setSelecting(undefined);
            chooseFunction(chosen);
          }}
        />
      )}
      {mode === 'function' && fn && (
        <InfoTip
          label={label + '函数说明'}
          text={
            props.functionDocs?.get(fn.id)?.summary ||
            props.functionDocs?.get(fn.id)?.description ||
            functionTitle(fn.id, props.functionDocs?.get(fn.id)) +
              ' · 返回 ' +
              expressionSchemaName(fn.returns)
          }
          onClick={() => edit('help')}
        />
      )}
      {mode === 'named' && named && Object.keys(named).length > 0 && (
        <label>
          <span>具名表达式</span>
          <StudioSelect
            aria-label={label + '具名表达式'}
            value={obj && 'use' in obj ? obj.use : ''}
            onValueChange={(value) => {
              onChange(JSON.stringify({ use: value }));
              setSelecting(undefined);
            }}
          >
            <option value="" disabled>
              选择表达式
            </option>
            {Object.keys(named).map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </StudioSelect>
        </label>
      )}
    </div>
  );
  const separateArguments = depth === 0;
  const functionArguments = (
    <>
      {mode === 'function' &&
        !folded &&
        m &&
        args &&
        call &&
        children.map((arg, index) => {
          const parameterHelp = getParameterHelp(fn, fn && props.functionDocs?.get(fn.id), index);
          const parameter = parameterHelp?.parameter;
          const name = combo
            ? '条件 ' + (index + 1)
            : comparison
              ? index === 0
                ? '左侧值'
                : '右侧值'
              : (parameterTitle(parameterHelp, props.functionDocs?.get(call.op)) ??
                '输入值 ' + (index + 1));
          const removable =
            combo ||
            !parameter ||
            (index === children.length - 1 &&
              (index >= (fn?.parameters.length ?? 0) || parameter.optional));
          return (
            <div className="reaction-argument" key={index}>
              <ExpressionField
                {...props}
                depth={depth + 1}
                path={path + '.' + index}
                inParameter={!combo}
                parameterHelp={parameterHelp}
                label={name}
                raw={m.raw(arg)}
                expected={parameter?.schema ?? true}
                advisory={false}
                onChange={(next) => onChange(m.replace(arg, next))}
              />
              {parameterHelp &&
                typeof parameter?.schema === 'object' &&
                (parameter.schema.type === 'object' || parameter.schema.type === 'array') && (
                  <details>
                    <summary>参数结构</summary>
                    <ArgumentHelp help={parameterHelp} />
                  </details>
                )}
              {removable && (
                <Button
                  variant="secondary"
                  type="button"
                  aria-label={'删除' + name}
                  onClick={() => {
                    if (combo && children.length === 2)
                      onChange(m.raw(children[index === 0 ? 1 : 0]));
                    else onChange(removeLayoutMember(raw, arg));
                  }}
                >
                  删除{name}
                </Button>
              )}
            </div>
          );
        })}
      {mode === 'function' && !folded && m && args && nextParam && (
        <Button
          variant="secondary"
          type="button"
          onClick={() => {
            onChange(
              m.replace(
                args,
                m.raw(args).slice(0, -1) +
                  (children.length ? ',' : '') +
                  defaultArgument(nextParam.schema) +
                  ']',
              ),
            );
          }}
        >
          {combo ? '添加条件' : '添加参数'}
        </Button>
      )}
    </>
  );
  return (
    <div
      role="group"
      aria-label={label}
      data-compact={props.inParameter || undefined}
      className="expression-field"
      data-depth={Math.min(depth, 3)}
      id={id + '-' + path}
      tabIndex={-1}
    >
      {!separateArguments && depth !== 0 && (
        <div className="expression-node-label">
          {mode === 'function' && call && (
            <IconButton
              icon={folded ? 'ChevronRight' : 'ChevronDown'}
              aria-label={(folded ? '展开' : '收起') + label}
              aria-expanded={!folded}
              onClick={() => setExpanded(!expanded)}
            />
          )}
          {label}
          {props.parameterHelp && (
            <InfoTip
              label={label + '说明'}
              text={
                (parameterMeaning(props.parameterHelp) || label) +
                ' · ' +
                expressionSchemaName(expected)
              }
            />
          )}
        </div>
      )}
      {!separateArguments && folded && expr !== undefined ? (
        <div className="expression-summary-row">
          <span className="expression-fold-summary">
            <ExpressionDisplay {...props} expr={expr} variant="compact" />
          </span>
          <Button
            variant="text"
            aria-label={label + '表达式详情'}
            aria-haspopup="dialog"
            onClick={(event) => {
              setDetailTrigger(event.currentTarget);
              edit('definition');
            }}
          >
            详情
          </Button>
        </div>
      ) : (
        <div className="expression-input-row" data-source={mode}>
          {selectors}
          {mode === 'field' && dataOnly && (
            <FieldPicker
              fields={tree}
              value={ref?.source === 'data' ? ref : null}
              label={
                ref?.source === 'data' && expr !== undefined
                  ? expressionLabel(expr, props, props.functionDocs)
                  : '选择字段'
              }
              onChange={(ref) => {
                setSelecting(undefined);
                onChange(JSON.stringify({ ref }));
              }}
            />
          )}
          {mode === 'field' && !dataOnly && (
            <Button
              variant="secondary"
              aria-label={label + '选择字段'}
              onClick={() => edit('fields')}
            >
              {expr !== undefined ? (
                <ExpressionDisplay expr={expr} {...props} variant="compact" />
              ) : (
                '选择字段'
              )}
            </Button>
          )}
          {mode === 'literal' && literalInput}
          {depth > 0 && (
            <Button
              variant="text"
              aria-label={label + '编辑表达式 JSON'}
              onClick={() => edit('json')}
            >
              JSON
            </Button>
          )}
        </div>
      )}
      {editing === 'definition' && expr !== undefined && (
        <Modal title={label + ' · 表达式详情'} onClose={close} returnFocus={detailTrigger}>
          <div className="expression-definition-body">
            <ExpressionDisplay {...props} expr={expr} />
          </div>
        </Modal>
      )}
      {fn && editing === 'help' && (
        <Modal title="函数说明" onClose={close}>
          <FunctionHelp manifest={fn} documentation={props.functionDocs?.get(fn.id)} />
        </Modal>
      )}
      {separateArguments
        ? mode === 'function' &&
          call && (
            <section className="expression-function-arguments" aria-label="函数参数">
              <Button variant="text" aria-expanded={!folded} onClick={() => setExpanded(!expanded)}>
                <Icon name={folded ? 'ChevronRight' : 'ChevronDown'} />
                {combo ? '子条件' : '函数参数'}
              </Button>
              {functionArguments}
            </section>
          )
        : functionArguments}
      {warning && <p role="status">{warning}</p>}
      {editing === 'fields' && (
        <ReactionFieldPicker
          title={label + '选择字段'}
          fields={fields}
          allowValidation={props.allowValidation ?? true}
          initial={selected}
          expectedType={expressionSchemaName(expected)}
          parameterMeaning={props.parameterHelp && parameterMeaning(props.parameterHelp)}
          onClose={close}
          onApply={(refs) => {
            if (refs[0]) onChange(JSON.stringify({ ref: refs[0] }));
            close();
          }}
        />
      )}
      {editing === 'json' && (
        <ExpressionText label={label} raw={raw} onChange={onChange} close={close} />
      )}
    </div>
  );
}
