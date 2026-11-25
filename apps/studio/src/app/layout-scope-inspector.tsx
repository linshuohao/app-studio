'use client';

import { useState, type ReactNode } from 'react';
import type { DataReference } from '@form-engine/protocol/definition';
import type { JsonNode } from '../components/json/model';
import { child, type Model } from './semantic-model';
import { ancestorBinders } from './layout-bindings';
import { assertScopeCanChange } from './layout-structure';
import {
  LayoutExpressionDialog,
  layoutExpressionContext,
  visibleExpression,
} from './layout-expression';
import { LayoutFieldPicker, fieldReferenceId } from './layout-field-picker';
import { isDataRef, type LayoutBindingField } from './layout-material-value';
import { Modal } from './modal';
import { StudioSelect } from '@form-engine/studio-design-components/select';

type Props = {
  m: Model;
  formPath: string;
  node: JsonNode;
  fields: LayoutBindingField[];
  locate: (path: string) => void;
  commit: (next: string, path: string) => Promise<void>;
  container: boolean;
};

function read(m: Model, n: JsonNode | undefined) {
  return n && JSON.parse(m.raw(n));
}
function isArray({ schema }: LayoutBindingField) {
  return (
    typeof schema === 'object' &&
    (schema.type === 'array' || (Array.isArray(schema.type) && schema.type.includes('array')))
  );
}
function EditDialog({
  title,
  action,
  close,
  submit,
  children,
}: {
  title: string;
  action: string;
  close: () => void;
  submit: () => Promise<void>;
  children: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title={title} onClose={close} closeDisabled={busy} className="layout-settings-dialog">
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          setBusy(true);
          setError('');
          try {
            await submit();
            close();
          } catch (e) {
            setError(e instanceof Error ? e.message : '无法应用配置。');
            setBusy(false);
          }
        }}
      >
        {children}
        {error && <p role="alert">{error}</p>}
        <footer>
          <button disabled={busy}>{action}</button>
        </footer>
      </form>
    </Modal>
  );
}

function RepeatEditor({ m, node, fields, commit, close }: Props & { close: () => void }) {
  const binder = child(node, 'scope');
  const body = child(node, 'node');
  const existingRef = read(m, child(binder, 'from'));
  const existingAlias = m.str(child(binder, 'as'));
  const [source, setSource] = useState<DataReference | undefined>(
    isDataRef(existingRef) ? existingRef : undefined,
  );
  const [alias, setAlias] = useState(existingAlias ?? '');
  const [repeat, setRepeat] = useState(true);
  const aliases = ancestorBinders(m, node).map((n) => m.str(child(n, 'as')));
  const suggested = (source?.path.split('/').at(-1) ?? '')
    .replaceAll('~1', '/')
    .replaceAll('~0', '~')
    .replace(/[^A-Za-z0-9_]/g, '');
  const aliasName = alias.trim() || (/^[A-Za-z_]/.test(suggested) ? suggested : 'item');
  return (
    <EditDialog
      title="数据范围"
      action="应用数据范围"
      close={close}
      submit={async () => {
        if (!repeat && binder && body && existingAlias !== undefined) {
          assertScopeCanChange(m, body, existingAlias);
          return commit(m.replace(node, m.raw(body)), node.path);
        }
        if (
          !source ||
          !fields.some((f) => fieldReferenceId(f.ref) === fieldReferenceId(source) && isArray(f))
        )
          throw Error('请选择当前作用域内的数组字段。');
        if (aliases.includes(aliasName)) throw Error('上层已有此作用域名称。');
        if (
          binder &&
          body &&
          isDataRef(existingRef) &&
          existingAlias !== undefined &&
          (aliasName !== existingAlias ||
            fieldReferenceId(source) !== fieldReferenceId(existingRef))
        ) {
          assertScopeCanChange(m, body, existingAlias);
        }
        const declaration = JSON.stringify({ from: source, as: aliasName, mode: 'each' });
        return commit(
          binder
            ? m.replace(binder, declaration)
            : m.replace(node, '{"scope":' + declaration + ',"node":' + m.raw(node) + '}'),
          node.path,
        );
      }}
    >
      {binder && (
        <label>
          显示方式
          <StudioSelect
            value={repeat ? 'each' : 'single'}
            onValueChange={(value) => setRepeat(value === 'each')}
          >
            <option value="each">每项显示一次</option>
            <option value="single">整张表单显示一次</option>
          </StudioSelect>
        </label>
      )}
      {repeat && (
        <>
          <LayoutFieldPicker
            label="数据来源"
            fields={fields}
            accepts={isArray}
            value={source}
            set={setSource}
          />
          <label>
            成员作用域名称
            <input
              value={alias}
              onChange={(e) => setAlias(e.target.value)}
              placeholder={aliasName}
            />
          </label>
        </>
      )}
    </EditDialog>
  );
}

function ConditionEditor({
  m,
  node,
  fields,
  formPath,
  commit,
  close,
}: Props & { close: () => void }) {
  const existing = m.str(child(node, 'material')) === 'condition';
  const props = child(node, 'props');
  const visible = child(props, 'visible');
  return (
    <LayoutExpressionDialog
      title="显示条件"
      action="应用显示条件"
      initial={
        existing ? (visibleExpression(m, node) ?? 'true') : '{"op":"core.lt","args":[null,0]}'
      }
      expected={{ type: 'boolean' }}
      fields={fields}
      verification={layoutExpressionContext(formPath, m, node, 'visibility')}
      close={close}
      apply={(expression) => {
        const raw = '{"$expr":' + expression + '}';
        const next = existing
          ? visible
            ? m.replace(visible, raw)
            : props
              ? m.property(props, 'visible', raw)
              : m.property(node, 'props', '{"visible":' + raw + '}')
          : m.replace(
              node,
              '{"material":"condition","props":{"visible":' +
                raw +
                '},"slots":{"default":[' +
                m.raw(node) +
                ']}}',
            );
        return commit(next, node.path);
      }}
    />
  );
}

export function LayoutScopeInspector(props: Props) {
  const { m, node, locate, container } = props;
  const [edit, setEdit] = useState<'repeat' | 'condition'>();
  const binder = child(node, 'scope');
  const alias = m.str(child(binder, 'as'));
  const material = m.str(child(node, 'material'));
  const materialProps = child(node, 'props');
  const visible = child(materialProps, 'visible');
  const safe = (path: string) =>
    ![...m.ambiguous].some((p) => p === path || p.startsWith(path + '/'));
  const editableCondition =
    (!materialProps || (materialProps.kind === 'object' && !m.ambiguous.has(materialProps.path))) &&
    (!visible || (safe(visible.path) && visibleExpression(m, node) !== undefined));
  const simpleRepeat =
    binder &&
    child(node, 'node') &&
    alias &&
    safe(binder.path) &&
    node.children?.every((n) => n.key === 'scope' || n.key === 'node') &&
    binder.children?.every((n) => ['from', 'as', 'mode'].includes(n.key!)) &&
    m.str(child(binder, 'mode')) === 'each' &&
    isDataRef(read(m, child(binder, 'from')));
  const scopes = ancestorBinders(m, node)
    .map((n) => m.str(child(n, 'as')))
    .filter(Boolean);
  return (
    <section className="layout-node-settings" aria-label="数据范围和显示条件">
      <div className="layout-context">
        {scopes.length ? '当前作用域 · ' + scopes.join(' › ') : '当前作用域 · 表单根'}
      </div>
      <div className="layout-setting-actions">
        {binder ? (
          simpleRepeat ? (
            <button type="button" onClick={() => setEdit('repeat')}>
              编辑数据范围
            </button>
          ) : (
            <button type="button" onClick={() => locate(binder.path)}>
              在 JSON 中查看数据范围
            </button>
          )
        ) : (
          container &&
          material !== 'condition' && (
            <button type="button" onClick={() => setEdit('repeat')}>
              设置重复区
            </button>
          )
        )}
        {material &&
          (material !== 'condition' || editableCondition ? (
            <button type="button" onClick={() => setEdit('condition')}>
              编辑显示条件
            </button>
          ) : (
            <button type="button" onClick={() => locate(visible?.path ?? node.path)}>
              在 JSON 中查看显示条件
            </button>
          ))}
      </div>
      {edit === 'repeat' && <RepeatEditor {...props} close={() => setEdit(undefined)} />}
      {edit === 'condition' && <ConditionEditor {...props} close={() => setEdit(undefined)} />}
    </section>
  );
}
