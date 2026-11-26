'use client';

import { createPortal } from 'react-dom';
import { JsonEditor } from '../components/json/json-editor';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DataReference } from '@form-engine/protocol/definition';
import type { JsonNode } from '../components/json/model';
import type { Schema } from '../components/catalog/contract-reference';
import type { Summary, Detail } from './asset-catalog';
import { Button, CardList, Field, Icon, Input } from '@form-engine/studio-design-components';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { MaterialCard } from './material-card';
import { Modal } from './modal';
import { failureMessage, platform } from './platform-api';
import { child, escapeKey, semanticModel, type Model } from './semantic-model';
import {
  removeLayoutMember,
  isDataRef,
  compatibleFields,
  FieldSelect,
  initialValue,
  validateValue,
  ValueInput,
  type LayoutBindingField,
} from './layout-material-value';
import { LayoutExpressionDialog } from './layout-expression';
import { ExpressionDisplay } from './expression-display';
import type { Expression } from '@form-engine/protocol/definition';
import { readExpression, valueAsExpression } from './reaction-expression-model';
import type { JsonSchema } from '@form-engine/protocol/capability';
import type { ExpressionVerificationContext } from './expression-verification';
import { usePendingNavigation } from './schema-navigation';
import './layout-inspector.css';

export type { LayoutBindingField } from './layout-material-value';
type Manifest = Detail['manifest'];
type Fields = LayoutBindingField[];
function useCatalog<T>(path?: string) {
  const [state, set] = useState<{ path: string; data?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    let active = true;
    void platform<T>(path).then(
      (data) => {
        if (active) set({ path, data });
      },
      (error) => {
        if (active) set({ path, error: failureMessage(error) });
      },
    );
    return () => {
      active = false;
    };
  }, [path]);
  return state?.path === path ? state : undefined;
}
function propsOf(manifest: Manifest) {
  const s = manifest.propsSchema;
  return (s && typeof s === 'object' ? (s.properties ?? {}) : {}) as Record<string, Schema>;
}
const detailPath = (id: string) => '/catalog/materials/' + encodeURIComponent(id);

export function LayoutMaterialPicker({
  fields,
  verification,
  binding,
  preferredField,
  rootOnly,
  onInsert,
  onClose,
}: {
  fields: Fields;
  binding?: MaterialBindingInput;
  verification: ExpressionVerificationContext;
  preferredField?: string;
  rootOnly?: boolean;
  onInsert: (raw: string) => void | Promise<void>;
  onClose: () => void;
}) {
  const [query, search] = useState('');
  const [asset, select] = useState<Summary>();
  const [busy, setBusy] = useState(false);
  const catalog = useCatalog<Summary[]>('/catalog/materials');
  const selected = useLayoutMaterial(asset?.id, binding && { ...binding, allowNew: true });
  const rows = catalog?.data?.filter((r) =>
    [r.id, r.title, r.category, r.summary]
      .join(' ')
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  return (
    <Modal title="选择布局物料" className="catalog-drawer" onClose={onClose} closeLabel="取消">
      {asset ? (
        <>
          <button type="button" disabled={busy} onClick={() => select(undefined)}>
            返回物料目录
          </button>
          <h3>{asset.title || asset.id}</h3>
          {selected?.error ? (
            <p role="alert">{selected.error}</p>
          ) : selected?.data ? (
            rootOnly && !selected.data.manifest.slots?.length ? (
              <p>根容器需要声明插槽，请选择其他物料。</p>
            ) : (
              <InsertMaterial
                key={asset.id + asset.version}
                {...{ fields, verification, preferredField, onInsert, busy, setBusy }}
                manifest={selected.data.manifest}
              />
            )
          ) : (
            <p>正在读取物料契约…</p>
          )}
        </>
      ) : (
        <>
          <label>
            搜索物料
            <input aria-label="搜索物料" value={query} onChange={(e) => search(e.target.value)} />
          </label>
          {catalog?.error ? (
            <p role="alert">{catalog.error}</p>
          ) : !rows ? (
            <p>正在读取目录…</p>
          ) : !rows.length ? (
            <p>没有匹配的物料。</p>
          ) : (
            <CardList
              label="可插入物料"
              items={rows}
              itemKey={(r) => JSON.stringify([r.id, r.version])}
              renderItem={(r) => <MaterialCard asset={r} onOpen={() => select(r)} />}
            />
          )}
        </>
      )}
    </Modal>
  );
}

function InsertMaterial({
  fields,
  verification,
  preferredField,
  manifest,
  onInsert,
  busy,
  setBusy,
}: {
  fields: Fields;
  verification: ExpressionVerificationContext;
  preferredField?: string;
  manifest: Manifest;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onInsert: (raw: string) => void | Promise<void>;
}) {
  const props = propsOf(manifest);
  const required = (
    typeof manifest.propsSchema === 'object' ? (manifest.propsSchema.required ?? []) : []
  ) as string[];
  const ports = Object.entries(manifest.bindings ?? {});
  const preferred = fields.find((f) => f.schemaPath === preferredField);
  const [bindings, setBindings] = useState<Record<string, DataReference>>(() => {
    if (!preferred) return {};
    const port = ports.find(
      ([, contract]) => compatibleFields([preferred], contract.schema).length,
    );
    return port ? { [port[0]]: preferred.ref } : {};
  });
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(required.map((k) => [k, initialValue(props[k] ?? true)])),
  );
  const [requests, setRequests] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  function build() {
    if (
      preferredField &&
      (!preferred ||
        !Object.values(bindings).some(
          (ref) => ref.scope === preferred.ref.scope && ref.path === preferred.ref.path,
        ))
    )
      throw Error('此位置或物料端口不能绑定拖入的字段。');
    if (ports.some(([k]) => !Object.hasOwn(bindings, k))) throw Error('请补全所有绑定端口。');
    const requestEntries = Object.keys(manifest.requests ?? {}).map((k) => {
      const request = requests[k]?.trim();
      if (!request) throw Error('请填写 Host 请求 ' + k);
      return [k, { type: 'host.request', request }];
    });
    const pairs = Object.entries(values).map(([k, raw]) => {
      validateValue(props[k]!, raw);
      return JSON.stringify(k) + ':' + raw;
    });
    const node = {
      material: manifest.id,
      ...(ports.length && { bindings }),
      ...(requestEntries.length && { requests: Object.fromEntries(requestEntries) }),
      ...(manifest.slots?.length && {
        slots: Object.fromEntries(manifest.slots.map((k) => [k, []])),
      }),
    };
    return (
      JSON.stringify(node).slice(0, -1) +
      (pairs.length ? ',"props":{' + pairs.join(',') + '}' : '') +
      '}'
    );
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        if (e.currentTarget.querySelector('[data-layout-invalid]')) {
          setError('请先补全属性的 JSON 值。');
          return;
        }
        setBusy(true);
        setError('');
        try {
          await onInsert(build());
        } catch (e) {
          setError(e instanceof Error ? e.message : '无法插入控件');
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset className="insert-fields" disabled={busy}>
        {ports.map(([k, contract]) => (
          <FieldSelect
            key={k}
            label={'绑定 ' + k}
            fields={fields}
            accepts={(field) => compatibleFields([field], contract.schema).length > 0}
            value={bindings[k]}
            set={(ref) => setBindings({ ...bindings, [k]: ref })}
          />
        ))}
        {Object.entries(props).map(([k, schema]) =>
          Object.hasOwn(values, k) ? (
            <ValueInput
              key={k}
              label={'属性 ' + k}
              raw={values[k]!}
              fields={fields}
              verification={verification}
              schema={schema}
              set={(raw) => setValues({ ...values, [k]: raw })}
            />
          ) : (
            <button
              type="button"
              key={k}
              onClick={() => setValues({ ...values, [k]: initialValue(schema) })}
            >
              配置属性 {k}
            </button>
          ),
        )}
        {Object.keys(manifest.requests ?? {}).map((k) => (
          <label key={k}>
            Host 请求 {k}
            <input
              aria-label={'Host 请求 ' + k}
              required
              value={requests[k] ?? ''}
              onChange={(e) => setRequests({ ...requests, [k]: e.target.value })}
            />
          </label>
        ))}
        <button type="submit" disabled={busy}>
          插入控件
        </button>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </form>
  );
}

type InspectorProps = {
  fields: Fields;
  verification: ExpressionVerificationContext;
  node: JsonNode;
  m: Model;
  text: string;
  apply: (next: string) => void;
  locate: (path: string) => void;
  verify?: (next: string) => Promise<void>;
  footer: HTMLElement | null;
  preview?: ReactNode;
  onPreview: (draft?: { base: string; path: string; text: string }) => void;
};
type MaterialBindingInput = {
  allowNew?: boolean;
  formPath: string;
  profile: string;
  source: import('./config-inspection').InspectionInput;
};
export function useLayoutMaterial(id?: string, bindingInput?: MaterialBindingInput) {
  const input = id && bindingInput ? JSON.stringify(bindingInput) : '';
  const [binding, setBinding] = useState<{
    input: string;
    id: string;
    query?: string;
    error?: string;
  }>();
  useEffect(() => {
    if (!input || !id) return;
    const abort = new AbortController();
    const { formPath, profile, source, allowNew } = JSON.parse(input) as MaterialBindingInput;
    void platform<
      {
        profile: string;
        dependencies: {
          id: string;
          kind: string;
          available: boolean;
          lock: { version: string; artifact: { digest: string } } | null;
        }[];
      }[]
    >(formPath + '/asset-bindings', { body: source, signal: abort.signal }).then(
      (profiles) => {
        if (abort.signal.aborted) return;
        const dependency = profiles
          .find((row) => row.profile === profile)
          ?.dependencies.find((asset) => asset.kind === 'materials' && asset.id === id);
        if (dependency?.lock && dependency.available) {
          setBinding({
            input,
            id,
            query: new URLSearchParams({
              version: dependency.lock.version,
              artifactDigest: dependency.lock.artifact.digest,
            }).toString(),
          });
        } else if (!dependency && allowNew) setBinding({ input, id, query: '' });
        else
          setBinding({
            input,
            id,
            error: dependency?.lock ? '锁定的物料制品不可用。' : '请先绑定该物料的版本。',
          });
      },
      (error: unknown) => {
        if (!abort.signal.aborted) setBinding({ input, id, error: failureMessage(error) });
      },
    );
    return () => abort.abort();
  }, [id, input]);
  const current = binding?.input === input && binding.id === id ? binding : undefined;
  const detail = useCatalog<Detail>(
    id &&
      (!input
        ? detailPath(id)
        : current?.query !== undefined
          ? detailPath(id) + '?' + current.query
          : undefined),
  );
  return current?.error ? { path: input, error: current.error } : detail;
}
export function LayoutMaterialInspector({
  result,
  ...props
}: InspectorProps & { result: ReturnType<typeof useLayoutMaterial> }) {
  const { node, text } = props;
  return (
    <section className="layout-material-inspector" aria-label="控件配置">
      {result?.error && <p role="alert">{result.error}</p>}
      {!result && <p role="status">正在读取控件配置…</p>}
      {result?.data && (
        <MaterialInspector
          key={node.path + '\n' + text}
          {...props}
          manifest={result.data.manifest}
        />
      )}
    </section>
  );
}

type Put = (
  group: string,
  key: string,
  raw: string,
  onError?: (message: string) => void,
) => Promise<void>;
const propertyLabels: Readonly<Record<string, string>> = {
  options: '选项设置',
  title: '标题',
  label: '显示名称',
  description: '描述',
  placeholder: '提示文字',
  startLabel: '开始日期名称',
  endLabel: '结束日期名称',
  clearable: '允许清空',
  disabled: '禁用',
  readOnly: '只读',
  maxLength: '最长字符数',
  inputMode: '输入方式',
  help: '帮助文字',
  requiredMark: '必填标记',
  required: '必填标记',
  filterKey: '搜索筛选条件',
  columns: '列数',
  gap: '网格间距',
  collapsible: '允许折叠',
  defaultExpanded: '默认展开',
  visible: '是否显示',
  variant: '样式',
  text: '文本内容',
  value: '显示值',
};
function summarizeProperty(raw: string | undefined) {
  if (raw === undefined) return '未设置';
  const value: unknown = JSON.parse(raw);
  if (Array.isArray(value)) return value.length + ' 项';
  if (value && typeof value === 'object' && '$literal' in value && Array.isArray(value.$literal))
    return value.$literal.length + ' 项';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'string') return value || '空文本';
  if (value && typeof value === 'object') {
    if ('$expr' in value) return '表达式';
    if ('$literal' in value) return 'JSON 字面值';
    return '对象';
  }
  return String(value);
}

function writeProperties(m: Model, node: JsonNode, changes: Record<string, string>) {
  const props = child(node, 'props');
  let raw = props ? m.raw(props) : '{}';
  for (const [name, value] of Object.entries(changes)) {
    const local = semanticModel(raw);
    raw = local.property(local.root, name, value);
  }
  return props ? m.replace(props, raw) : m.property(node, 'props', raw);
}

function MaterialInspector({
  node,
  m,
  fields,
  verification,
  apply,
  locate,
  verify,
  manifest,
  footer,
  preview,
  onPreview,
  text,
}: InspectorProps & { manifest: Manifest }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [incomplete, setIncomplete] = useState(new Set<string>());
  const [editingMapping, setEditingMapping] = useState<string>();
  const [revision, setRevision] = useState(0);
  const propertiesRef = useRef<HTMLElement>(null);
  const propertyRequest = useRef(0);
  const dirty = incomplete.size > 0 || Object.keys(changes).length > 0;
  const markIncomplete = useCallback((id: string, invalid: boolean) => {
    setIncomplete((before) => {
      if (before.has(id) === invalid) return before;
      const next = new Set(before);
      if (invalid) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  function discard() {
    ++propertyRequest.current;
    setChanges({});
    setIncomplete(new Set());
    setEditingMapping(undefined);
    setError('');
    setRevision((value) => value + 1);
  }
  usePendingNavigation('inspector', dirty || editingMapping ? { discard } : null);
  useLayoutEffect(() => {
    try {
      onPreview(
        Object.keys(changes).length
          ? { base: text, path: node.path, text: writeProperties(m, node, changes) }
          : undefined,
      );
    } catch {
      onPreview(undefined);
    }
    return () => onPreview(undefined);
  }, [m, node, changes, text, onPreview]);
  const active = useRef(false);
  const pending = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const put: Put = async (group, key, raw, onError = setError) => {
    if (pending.current) return;
    pending.current = true;
    const request = ++propertyRequest.current;
    setBusy(true);
    setError('');
    try {
      JSON.parse(raw);
      const parent = child(node, group);
      let next;
      if (group === 'bindings' && key === 'value' && child(node, 'bind')) {
        const ref: DataReference = JSON.parse(raw);
        if ((parent && child(parent, key)) || ref.scope !== undefined)
          throw Error('该简写绑定仅支持根字段，请在 JSON 中更改绑定写法。');
        next = m.property(node, 'bind', JSON.stringify(ref.path));
      } else {
        next = parent
          ? m.property(parent, key, raw)
          : m.property(node, group, '{' + JSON.stringify(key) + ':' + raw + '}');
      }
      await verify?.(next);
      if (active.current && request === propertyRequest.current) {
        apply(next);
        if (group !== 'bindings') {
          setEditingMapping(undefined);
          setRevision((value) => value + 1);
        }
      }
    } catch (e) {
      if (active.current && request === propertyRequest.current)
        onError(e instanceof Error ? e.message : '无法应用修改。');
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  };
  const get = (group: string, k: string) => child(child(node, group), k);
  function safe(group: string, k: string) {
    const path = node.path + '/' + group + '/' + escapeKey(k);
    return (
      !m.ambiguous.has(node.path) &&
      ![...m.ambiguous].some(
        (p) => p === path || p.startsWith(path + '/') || path.startsWith(p + '/'),
      )
    );
  }
  const jsonOnly = (group: string, k: string) => (
    <button
      type="button"
      key={group + k}
      onClick={() => locate(node.path + '/' + group + '/' + escapeKey(k))}
    >
      {k} · 在 JSON 中编辑
    </button>
  );
  const properties = Object.entries(propsOf(manifest));
  const compact = manifest.id === 'text-input';
  const bindings = Object.keys(manifest.bindings ?? {});
  const hasBehavior =
    Object.keys(manifest.requests ?? {}).length || Object.keys(manifest.events ?? {}).length;
  async function applyProperties() {
    if (pending.current) return;
    pending.current = true;
    const request = ++propertyRequest.current;
    setBusy(true);
    setError('');
    try {
      if (propertiesRef.current?.querySelector('[data-layout-invalid]'))
        throw Error('请先补全属性值。');
      for (const [key, raw] of Object.entries(changes)) validateValue(propsOf(manifest)[key]!, raw);
      const next = writeProperties(m, node, changes);
      await verify?.(next);
      if (active.current && request === propertyRequest.current) apply(next);
    } catch (error) {
      if (active.current && request === propertyRequest.current)
        setError(error instanceof Error ? error.message : '无法应用属性。');
    } finally {
      pending.current = false;
      if (active.current) setBusy(false);
    }
  }
  const actions = dirty && (
    <div className="layout-property-actions">
      <div className="layout-property-status">
        <span role="status">{busy ? '正在检查属性…' : '属性预览中，尚未应用'}</span>
        {compact && error && <p role="alert">{error}</p>}
      </div>
      <Button
        variant="text"
        disabled={busy}
        onClick={() => {
          discard();
          requestAnimationFrame(() =>
            propertiesRef.current?.querySelector<HTMLElement>('input, button')?.focus(),
          );
        }}
      >
        还原
      </Button>
      <Button
        disabled={busy || incomplete.size > 0 || !Object.keys(changes).length}
        onClick={() => void applyProperties()}
      >
        应用属性
      </Button>
    </div>
  );
  return (
    <fieldset className="layout-property-stack" disabled={busy} aria-label="物料属性">
      {!!properties.length && (
        <section className="layout-inspector-group" aria-label="显示与选项" ref={propertiesRef}>
          <h4>显示与选项</h4>
          <fieldset
            className="layout-props-list"
            data-compact-properties={compact || undefined}
            key={revision}
            disabled={!!editingMapping}
          >
            {properties.map(([name, schema]) => {
              if (
                !safe('props', name) ||
                (child(node, 'props') && child(node, 'props')?.kind !== 'object')
              )
                return jsonOnly('props', name);
              const n = get('props', name);
              const initial = n && m.raw(n);
              return (
                <Property
                  key={name}
                  {...{ name, schema, fields, verification, initial }}
                  raw={changes[name]}
                  compact={compact}
                  optionList={manifest.id === 'select' && name === 'options'}
                  onIncomplete={markIncomplete}
                  set={(next) => {
                    setError('');
                    setChanges((before) => {
                      const after = { ...before };
                      if (next === initial) delete after[name];
                      else after[name] = next;
                      return after;
                    });
                  }}
                />
              );
            })}
          </fieldset>
          {preview}
          {!compact && actions}
        </section>
      )}
      <fieldset className="layout-property-secondary" disabled={dirty}>
        {!!bindings.length && (
          <fieldset
            className="layout-inspector-group layout-inspector-bindings"
            aria-label="数据绑定"
            disabled={!!editingMapping}
          >
            <h4>数据绑定</h4>
            {Object.entries(manifest.bindings ?? {}).map(([k, contract]) => {
              if (!safe('bindings', k)) return jsonOnly('bindings', k);
              const n = get('bindings', k);
              const bind = k === 'value' ? child(node, 'bind') : undefined;
              if (bind && (n || bind.kind !== 'string' || m.ambiguous.has(bind.path)))
                return (
                  <button key={k} onClick={() => locate(bind.path)}>
                    绑定 {k} · 在 JSON 中编辑
                  </button>
                );
              const current = bind
                ? { source: 'data', path: m.str(bind) }
                : n && JSON.parse(m.raw(n));
              if (n && !isDataRef(current)) return jsonOnly('bindings', k);
              const picker = (
                <FieldSelect
                  label={k === 'value' ? '更换绑定字段' : '绑定 ' + k}
                  value={current}
                  fields={fields}
                  accepts={(field) =>
                    (!bind || field.ref.scope === undefined) &&
                    compatibleFields([field], contract.schema).length > 0
                  }
                  set={(v) => void put('bindings', k, JSON.stringify(v))}
                />
              );
              if (!compact) return <div key={k}>{picker}</div>;
              const boundField =
                current &&
                fields.find(({ ref }) => ref.scope === current.scope && ref.path === current.path);
              const path =
                current && [current.scope, current.path || '/'].filter(Boolean).join(' · ');
              const fieldTitle =
                boundField && m.str(child(m.byPath.get(boundField.schemaPath), 'title'));
              return (
                <div className="layout-binding-row" key={k}>
                  <div className="layout-binding-identity">
                    <strong>{fieldTitle || (current ? '绑定字段' : '未绑定字段')}</strong>
                    {path && <code>{path}</code>}
                  </div>
                  {picker}
                </div>
              );
            })}
          </fieldset>
        )}
        {!!hasBehavior && (
          <section className="layout-inspector-group" aria-label="行为与请求">
            <h4>行为与请求</h4>
            {[
              ...Object.keys(manifest.requests ?? {}).map((k) => ({
                group: 'requests' as const,
                k,
              })),
              ...Object.keys(manifest.events ?? {}).map((k) => ({ group: 'on' as const, k })),
            ].map(({ group, k }) => {
              if (!safe(group, k)) return jsonOnly(group, k);
              const n = get(group, k);
              const kind = m.str(child(n, 'type'));
              if (
                n &&
                !(group === 'requests'
                  ? kind === 'host.request'
                  : kind === 'host.emit' || kind === 'form.command')
              )
                return jsonOnly(group, k);
              const mapping = group + '/' + k;
              return (
                <Mapping
                  key={mapping + ':' + revision}
                  name={k}
                  {...{ group, put, m }}
                  initial={n}
                  disabled={!!editingMapping && editingMapping !== mapping}
                  onEdit={() => setEditingMapping(mapping)}
                  onDiscard={editingMapping === mapping ? discard : undefined}
                />
              );
            })}
          </section>
        )}
      </fieldset>
      {error && (!compact || !dirty) && <p role="alert">{error}</p>}
      {compact && footer && actions && createPortal(actions, footer)}
    </fieldset>
  );
}

function Property({
  name,
  schema,
  fields,
  verification,
  initial,
  raw,
  set,
  optionList,
  compact,
  onIncomplete,
}: {
  name: string;
  schema: Schema;
  fields: Fields;
  verification: ExpressionVerificationContext;
  initial?: string;
  raw?: string;
  set: (raw: string) => void;
  optionList: boolean;
  compact: boolean;
  onIncomplete: (id: string, active: boolean) => void;
}) {
  const title = propertyLabels[name] ?? name;
  const value = raw ?? initial ?? initialValue(schema);
  const scalar =
    typeof schema === 'object' &&
    (Array.isArray(schema.enum) ||
      [schema.type]
        .flat()
        .some((type) => ['string', 'number', 'integer', 'boolean'].includes(type ?? '')));
  if (compact && scalar) {
    const model = semanticModel(value);
    const shape = typeof schema === 'object' ? schema : {};
    const parsed: unknown = JSON.parse(value);
    const literal = Array.isArray(shape.enum)
      ? shape.enum.includes(parsed)
      : typeof parsed === (shape.type === 'integer' ? 'number' : shape.type);
    if (
      literal ||
      (!model.ambiguous.size && model.root.children?.length === 1 && child(model.root, '$expr'))
    ) {
      return (
        <CompactProperty
          {...{ name, schema, fields, verification, title, value, set, onIncomplete }}
          unset={raw === undefined && initial === undefined}
        />
      );
    }
  }
  const content = (
    <ValueInput
      label={'属性 ' + name}
      raw={value}
      titleInSummary={!scalar || optionList}
      {...{ schema, fields, verification, set, optionList, title, onIncomplete }}
    />
  );
  if (scalar && !optionList) return <div className="layout-property-inline">{content}</div>;
  return (
    <details className={'layout-property' + (optionList ? ' layout-options-entry' : '')}>
      <summary
        className="layout-property-row"
        aria-label={optionList ? '选项设置' : '属性 ' + name}
      >
        <span>{title}</span>
        <small>{summarizeProperty(raw ?? initial)}</small>
      </summary>
      <div className="layout-property-body">{content}</div>
    </details>
  );
}

function CompactProperty({
  name,
  schema,
  fields,
  verification,
  title,
  value,
  set,
  onIncomplete,
  unset,
}: {
  name: string;
  schema: Schema;
  fields: Fields;
  verification: ExpressionVerificationContext;
  title: string;
  value: string;
  set: (raw: string) => void;
  onIncomplete: (id: string, active: boolean) => void;
  unset: boolean;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const [expression, setExpression] = useState<string>();
  const [invalidNumber, setInvalidNumber] = useState<string>();
  const shape = typeof schema === 'object' ? schema : {};
  const parsed = JSON.parse(value);
  const model = semanticModel(value);
  const expressionNode = child(model.root, '$expr');
  const numeric = shape.type === 'integer' || shape.type === 'number';
  const invalid = invalidNumber !== undefined;
  useLayoutEffect(() => {
    if (!invalid) return;
    onIncomplete(id, true);
    return () => onIncomplete(id, false);
  }, [id, invalid, onIncomplete]);
  let summary: Expression | undefined;
  if (expressionNode) {
    try {
      summary = readExpression(model.raw(expressionNode));
    } catch {
      // Keep the invalid value available for the expression editor to repair.
    }
  }
  return (
    <>
      <Field.Root
        className="layout-compact-property"
        data-full-width={name === 'placeholder' || undefined}
        invalid={invalid}
      >
        <div className="layout-compact-heading">
          {expressionNode ? <span>{title}</span> : <Field.Label htmlFor={id}>{title}</Field.Label>}
          <Button
            ref={trigger}
            variant="text"
            aria-label={'配置' + title + '的取值'}
            disabled={invalid}
            onClick={() =>
              setExpression(expressionNode ? model.raw(expressionNode) : valueAsExpression(value))
            }
          >
            {expressionNode ? '编辑表达式' : '配置取值'}
          </Button>
        </div>
        {expressionNode ? (
          <p className="layout-expression-summary">
            <Icon name="FunctionSquare" />
            {summary === undefined ? (
              '待修复的表达式'
            ) : (
              <ExpressionDisplay
                expr={summary}
                variant="compact"
                fields={fields.map((item) => ({ ...item, depth: 0 }))}
                manifests={[]}
              />
            )}
          </p>
        ) : Array.isArray(shape.enum) ? (
          <StudioSelect id={id} aria-label={title} value={value} onValueChange={set}>
            {shape.enum.map((choice) => (
              <option key={JSON.stringify(choice)} value={JSON.stringify(choice)}>
                {choice === 'text' ? '文本键盘' : choice === 'tel' ? '电话键盘' : String(choice)}
              </option>
            ))}
          </StudioSelect>
        ) : shape.type === 'boolean' ? (
          <label className="layout-compact-checkbox">
            <Field.Control
              id={id}
              type="checkbox"
              aria-label={title}
              checked={parsed === true}
              onChange={(event) => set(String(event.target.checked))}
            />
            {name === 'disabled' ? '禁止输入和修改' : '允许查看，禁止修改'}
          </label>
        ) : (
          <Input
            id={id}
            aria-label={title}
            type={numeric ? 'number' : 'text'}
            min={numeric ? (shape.minimum as number | undefined) : undefined}
            step={numeric ? (shape.type === 'integer' ? 1 : 'any') : undefined}
            placeholder={numeric ? '不限制' : '未设置'}
            value={invalid ? invalidNumber : unset && numeric ? '' : String(parsed ?? '')}
            onChange={(event) => {
              const input = event.currentTarget;
              if (numeric && (!input.value || !input.validity.valid)) {
                setInvalidNumber(input.value);
                return;
              }
              setInvalidNumber(undefined);
              set(numeric ? JSON.stringify(input.valueAsNumber) : JSON.stringify(input.value));
            }}
          />
        )}
        {invalid && <Field.Error match>请输入大于或等于 0 的整数。</Field.Error>}
      </Field.Root>
      {expression !== undefined && (
        <LayoutExpressionDialog
          title={title + '的取值'}
          initial={expression}
          expected={schema as JsonSchema}
          fields={fields}
          verification={verification}
          close={() => {
            setExpression(undefined);
            requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true }));
          }}
          apply={(raw) => {
            if (raw === expression) return;
            const next = readExpression(raw);
            set(next !== null && typeof next === 'object' ? '{"$expr":' + raw + '}' : raw);
          }}
          action="应用取值"
        />
      )}
    </>
  );
}

function Mapping({
  name,
  group,
  m,
  initial,
  put,
  disabled,
  onEdit,
  onDiscard,
}: {
  name: string;
  group: 'requests' | 'on';
  m: Model;
  initial?: JsonNode;
  put: Put;
  disabled: boolean;
  onEdit: () => void;
  onDiscard?: () => void;
}) {
  const request = group === 'requests';
  const oldType = m.str(child(initial, 'type'));
  const [type, choose] = useState(oldType ?? (request ? 'host.request' : 'host.emit'));
  const key = request ? 'request' : 'event';
  const [host, setHost] = useState(m.str(child(initial, key)) ?? '');
  const commandNode = child(initial, 'command');
  const payloadNode = child(initial, 'payload');
  const [command, setCommand] = useState(
    commandNode
      ? m.raw(commandNode)
      : '{"op":"set","target":{"source":"data","path":""},"value":null}',
  );
  const [payload, setPayload] = useState(payloadNode ? m.raw(payloadNode) : '');
  const [error, setError] = useState('');
  const title = (request ? '请求 ' : '事件 ') + name;
  return (
    <details className="layout-property">
      <summary className="layout-property-row">
        <span>{title}</span>
        <small>{initial ? '已配置' : '未设置'}</small>
      </summary>
      <fieldset
        className="layout-property-body layout-mapping-body"
        disabled={disabled}
        onChange={onEdit}
      >
        {!request && (
          <label>
            事件意图 {name}
            <StudioSelect value={type} onValueChange={choose}>
              <option value="host.emit">Host 事件</option>
              <option value="form.command">表单命令</option>
            </StudioSelect>
          </label>
        )}
        {type === 'form.command' ? (
          <div>
            命令 {name}
            <JsonEditor
              readOnly={false}
              initialMode="text"
              label={'命令 ' + name}
              text={command}
              onChange={setCommand}
            />
          </div>
        ) : (
          <>
            <label>
              Host {title}
              <input value={host} onChange={(e) => setHost(e.target.value)} />
            </label>
            <div>
              Payload {name}
              <JsonEditor
                readOnly={false}
                initialMode="text"
                text={payload}
                label={'Payload ' + name}
                onChange={setPayload}
              />
              <small>省略时转发原事件参数</small>
            </div>
          </>
        )}
        {onDiscard && (
          <button type="button" className="quiet" onClick={onDiscard}>
            还原此映射
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            try {
              let raw: string;
              if (type === 'form.command') {
                JSON.parse(command);
                raw = '{"type":"form.command","command":' + command + '}';
              } else {
                if (!host.trim()) throw Error('请填写 Host 名称。');
                if (payload.trim()) JSON.parse(payload);
                raw =
                  '{"type":' +
                  JSON.stringify(type) +
                  ',' +
                  JSON.stringify(key) +
                  ':' +
                  JSON.stringify(host.trim()) +
                  (payload.trim() ? ',"payload":' + payload : '') +
                  '}';
              }
              if (initial) {
                const edits =
                  type === 'form.command'
                    ? {
                        type,
                        command,
                        ...(type !== oldType && { event: undefined, payload: undefined }),
                      }
                    : {
                        type,
                        [key]:
                          host.trim() === m.str(child(initial, key))
                            ? m.raw(child(initial, key)!)
                            : JSON.stringify(host.trim()),
                        ...(type !== oldType && { command: undefined }),
                        payload: payload.trim() ? payload : undefined,
                      };
                raw = m.raw(initial);
                for (const [field, value] of Object.entries(edits)) {
                  const local = semanticModel(raw);
                  const member = child(local.root, field);
                  if (value === undefined) {
                    if (member) raw = removeLayoutMember(raw, member);
                  } else if (
                    field === 'type' ? type !== oldType : !member || value !== local.raw(member)
                  ) {
                    raw = local.property(
                      local.root,
                      field,
                      field === 'type' ? JSON.stringify(type) : value,
                    );
                  }
                }
              }
              setError('');
              void put(group, name, raw, setError);
            } catch (e) {
              setError(e instanceof Error ? e.message : '配置无效');
            }
          }}
        >
          应用{title}
        </button>
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </details>
  );
}
