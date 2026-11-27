'use client';
import { CodeBlock } from '../components/code-block';
import { useEffect, useMemo, useState } from 'react';
import { Modal } from './modal';
import { FieldPickerControl, fieldReferenceId, referenceFieldRows } from './field-picker';
import { platform, failureMessage } from './platform-api';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { ManifestInput, defaultLiteral, validateLiteral } from './manifest-input';
import { JsonEditor } from '../components/json/json-editor';
import { addNode, editNode } from '../components/json/model';
import { compactJson } from '../components/json/format';
import { type Detail, type Summary } from './asset-catalog';
import { schemaType, type Schema } from '../components/catalog/contract-reference';
import { CardList, Button } from '@form-engine/studio-design-components';
import { MaterialCard } from './material-card';
import { insertionContext, type CatalogKind } from './catalog-targets';

function Choice({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: string;
  choices: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <StudioSelect aria-label={label} value={value} onValueChange={onChange}>
        <option value="">请选择</option>
        {choices.map(([id, title]) => (
          <option key={id} value={id}>
            {title}
          </option>
        ))}
      </StudioSelect>
    </label>
  );
}
function useCatalog<T>(path?: string) {
  const [state, setState] = useState<{ path: string; value?: T; error?: string }>();
  useEffect(() => {
    if (!path) return;
    let active = true;
    platform<T>(path).then(
      (value) => {
        if (active) setState({ path, value });
      },
      (e) => {
        if (active) setState({ path, error: failureMessage(e) });
      },
    );
    return () => {
      active = false;
    };
  }, [path]);
  return state?.path === path ? state : undefined;
}
import { catalogAssetPath, useAssetBindingProfiles } from './asset-binding-editor';
import type { InspectionInput } from './config-inspection';

type Apply = (source: string, next: string, path: string) => void;
export function CatalogInsert({
  kind,
  text,
  initialTarget,
  binding,
  onApply,
  onClose,
}: {
  kind: CatalogKind;
  initialTarget?: string;
  binding?: { formPath: string; input: InspectionInput };
  text: string;
  onApply: Apply;
  onClose: () => void;
}) {
  const [selected, select] = useState<Summary>();
  const [query, search] = useState(''),
    [category, setCategory] = useState(''),
    [tech, setTech] = useState('');
  const catalog = useCatalog<Summary[]>('/catalog/' + kind);
  const rows = catalog?.value ?? [];
  const options = (key: 'category' | 'implementation') =>
    Array.from(new Set(rows.map((row) => row[key]).filter((v): v is string => !!v))).map(
      (v) => [v, v] as [string, string],
    );
  const filtered = rows.filter(
    (r) =>
      (!category || r.category === category) &&
      (!tech || r.implementation === tech) &&
      [r.id, r.title, r.summary].join(' ').toLowerCase().includes(query.toLowerCase()),
  );
  const model = useMemo(() => {
    try {
      return { context: insertionContext(text, kind) };
    } catch {
      return { error: '配置无法可靠解析，请先修复 JSON 语法、重复属性或结构。' };
    }
  }, [text, kind]);
  return (
    <Modal
      wide
      className="catalog-drawer"
      title={kind === 'materials' ? '添加物料' : '插入函数'}
      onClose={onClose}
    >
      {model.error ? (
        <p role="alert">{model.error}</p>
      ) : selected && model.context ? (
        <>
          <button className="text-button" onClick={() => select(undefined)}>
            返回目录
          </button>
          <InsertFields
            binding={binding}
            key={selected.id + selected.version}
            {...{ kind, asset: selected, text, context: model.context, initialTarget, onApply }}
          />
        </>
      ) : (
        <>
          <div className="insert-filters">
            <label>
              搜索目录
              <input value={query} onChange={(e) => search(e.target.value)} />
            </label>
            <Choice
              label="分类"
              value={category}
              choices={options('category')}
              onChange={setCategory}
            />
            <Choice
              label="技术类型"
              value={tech}
              choices={options('implementation')}
              onChange={setTech}
            />
          </div>
          {catalog?.error ? (
            <p role="alert">{catalog.error}</p>
          ) : !catalog ? (
            <p>正在读取目录…</p>
          ) : !filtered.length ? (
            <p>没有匹配的条目。</p>
          ) : kind === 'materials' ? (
            <CardList
              label="可插入物料"
              items={filtered}
              itemKey={(r) => JSON.stringify([r.id, r.version])}
              renderItem={(r) => <MaterialCard asset={r} onOpen={() => select(r)} />}
            />
          ) : (
            <div className="insert-functions">
              {filtered.map((r) => (
                <Button key={r.id + r.version} variant="secondary" onClick={() => select(r)}>
                  {r.title || r.id} · {r.id}
                </Button>
              ))}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
function InsertFields({
  kind,
  asset,
  initialTarget,
  binding,
  text,
  context,
  onApply,
}: {
  kind: CatalogKind;
  asset: Summary;
  initialTarget?: string;
  binding?: { formPath: string; input: InspectionInput };
  text: string;
  context: ReturnType<typeof insertionContext>;
  onApply: Apply;
}) {
  const [path, setPath] = useState(initialTarget ?? ''),
    [values, setValues] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState<{
      source: string;
      next: string;
      path: string;
      fragment: string;
      before?: string;
    }>();
  const rawProfile = /^\/views\/([^/]+)/.exec(path)?.[1];
  const selectedProfile = rawProfile?.replaceAll('~1', '/').replaceAll('~0', '~');
  const profiles = useAssetBindingProfiles(binding?.formPath, binding?.input);
  const references = profiles?.profiles
    ?.filter(({ profile }) => !selectedProfile || selectedProfile === profile)
    .flatMap(({ dependencies }) =>
      dependencies.filter(
        (dependency) =>
          dependency.id === asset.id &&
          dependency.kind === (kind === 'materials' ? 'materials' : 'pureFunctions'),
      ),
    );
  const locked = references?.[0]?.lock;
  const sharedProfilesDisagree =
    path === '/expressions' &&
    locked &&
    references!.length < (profiles?.profiles?.length ?? 0) &&
    locked.version !== asset.version;
  const conflicted =
    sharedProfilesDisagree ||
    references?.some(
      ({ lock, available }) =>
        !available || !lock || lock.artifact.digest !== locked?.artifact.digest,
    );
  const error =
    profiles?.error ??
    (conflicted ? '这个资产在现有视图中待绑定或版本不同。请先在资产版本中确认。' : undefined);
  const detail = useCatalog<Detail>(
    !path || (binding && !profiles) || error
      ? undefined
      : catalogAssetPath(
          kind,
          asset.id,
          locked?.version ?? asset.version,
          locked?.artifact.digest ?? asset.artifact.digest,
        ),
  );
  const manifest = detail?.value?.manifest;
  function put(k: string, v: string) {
    setPreview(undefined);
    setValues((old) => ({ ...old, [k]: v }));
  }
  const target = context.targets.find((t) => (t.named ? '/expressions' : t.node.path) === path);
  const fieldRefs = context.fields.map(({ path, title, type }) => ({
    ref: { source: 'data' as const, path },
    label: title,
    detail: type,
  }));
  const fieldRows = referenceFieldRows(fieldRefs);
  function fieldValue(path: string | undefined) {
    return path ? fieldReferenceId({ source: 'data', path }) : undefined;
  }
  function chooseField(key: string, id: string) {
    const picked = fieldRefs.find(({ ref }) => fieldReferenceId(ref) === id);
    if (picked) put(key, picked.ref.path);
  }
  const bindingNames = Object.keys(manifest?.bindings ?? {}),
    requestNames = Object.keys(manifest?.requests ?? {});
  const ps = manifest?.propsSchema;
  const properties = (typeof ps === 'object' ? (ps.properties ?? {}) : {}) as Record<
    string,
    Schema
  >;
  const required = (typeof ps === 'object' ? (ps.required ?? []) : []) as string[];
  const params = manifest?.parameters ?? [];
  const restCount = Number(values.restCount || 0);
  const args = [
    ...params,
    ...Array.from({ length: restCount }, (_, i) => ({
      name: manifest?.restParameter?.name + ' ' + (i + 1),
      schema: manifest?.restParameter?.schema ?? true,
      optional: false,
    })),
  ];
  function ref(v: string) {
    if (!context.fields.some(({ path }) => path === v)) throw Error('请选择已有数据字段。');
    return { source: 'data', path: v };
  }
  function input(k: string, label: string) {
    return (
      <label key={k}>
        {label}
        <input
          aria-label={label}
          value={values[k] ?? ''}
          onChange={(e) => put(k, e.target.value)}
        />
      </label>
    );
  }
  function build() {
    if (!manifest || !target) throw Error('请选择目标位置。');
    if (kind === 'functions') {
      if (target.named) {
        const name = values.expressionName?.trim();
        if (!name) throw Error('请填写表达式名称。');
        if (target.node.path && target.node.children?.some((c) => c.key === name))
          throw Error('该表达式名称已存在。');
      }
      const ordered: string[] = [];
      for (const [i, p] of args.entries()) {
        const v = values['arg' + i];
        if (!v) {
          if (p.optional && args.slice(i + 1).every((_, j) => !values['arg' + (i + 1 + j)])) break;
          throw Error('请填写参数 ' + p.name);
        }
        ordered.push(
          values['mode' + i] === 'literal'
            ? '{"literal":' + compactJson(v) + '}'
            : JSON.stringify({ ref: ref(v) }),
        );
      }
      const expression =
        '{"op":' + JSON.stringify(asset.id) + ',"args":[' + ordered.join(',') + ']}';
      return target.wrap ? '{"$expr":' + expression + '}' : expression;
    }
    const parts = ['"material":' + JSON.stringify(asset.id)];
    const props: string[] = [];
    for (const [name, schema] of Object.entries(properties)) {
      const v =
        values['prop' + name] ??
        (required.includes(name) && name !== 'filterKey' ? defaultLiteral(schema) : undefined);
      if (!v) {
        if (required.includes(name)) throw Error('请填写必填属性 ' + name);
        continue;
      }
      const val =
        name === 'filterKey' ? JSON.stringify({ $expr: { ref: ref(v) } }) : compactJson(v);
      if (name !== 'filterKey') validateLiteral(schema, JSON.parse(val));
      props.push(JSON.stringify(name) + ':' + val);
    }
    if (props.length) parts.push('"props":{' + props.join(',') + '}');
    if (bindingNames.length)
      parts.push(
        '"bindings":' +
          JSON.stringify(
            Object.fromEntries(bindingNames.map((n) => [n, ref(values['binding' + n])])),
          ),
      );
    if (requestNames.length)
      parts.push(
        '"requests":' +
          JSON.stringify(
            Object.fromEntries(
              requestNames.map((n) => {
                const request = values['req' + n]?.trim();
                if (!request) throw Error('请填写 Host 请求 ' + n);
                return [n, { type: 'host.request', request }];
              }),
            ),
          ),
      );
    if (manifest.slots?.length)
      parts.push(
        '"slots":' + JSON.stringify(Object.fromEntries(manifest.slots.map((s) => [s, []]))),
      );
    return '{' + parts.join(',') + '}';
  }
  let fragment = '',
    hint = '';
  try {
    fragment = build();
  } catch (e) {
    hint =
      e instanceof SyntaxError
        ? '请输入有效的 JSON 值。'
        : e instanceof Error
          ? e.message
          : '请检查配置';
  }
  return (
    <div className="insert-fields">
      <h3>{asset.title || asset.id}</h3>
      <Choice
        label="目标位置"
        value={path}
        choices={context.targets.map((t) => [t.named ? '/expressions' : t.node.path, t.label])}
        onChange={(v) => {
          setPath(v);
          setValues({});
          setPreview(undefined);
        }}
      />
      {!context.targets.length && <p>当前配置没有支持的位置。请先添加视图或具名表达式。</p>}
      {error || detail?.error ? (
        <p role="alert">{error || detail?.error}</p>
      ) : !path ? null : !manifest ? (
        <p>正在读取契约…</p>
      ) : (
        <>
          {path && <small>{path}</small>}
          {target?.named && input('expressionName', '表达式名称')}
          {Object.entries(properties).map(([n, s]) =>
            n === 'filterKey' ? (
              <FieldPickerControl
                key={n}
                label="filterKey 来源字段"
                value={fieldValue(values['prop' + n])}
                rows={fieldRows}
                onChange={(id) => chooseField('prop' + n, id)}
              />
            ) : (
              <div key={n}>
                {!required.includes(n) && (
                  <label>
                    <input
                      type="checkbox"
                      checked={values['prop' + n] !== undefined}
                      onChange={(e) => {
                        setPreview(undefined);
                        setValues((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next['prop' + n] = defaultLiteral(s);
                          else delete next['prop' + n];
                          return next;
                        });
                      }}
                    />
                    设置 {n}
                  </label>
                )}
                {(required.includes(n) || values['prop' + n] !== undefined) && (
                  <ManifestInput
                    label={n + (required.includes(n) ? '（必填）' : '') + ' · ' + schemaType(s)}
                    schema={s}
                    value={values['prop' + n] ?? defaultLiteral(s)}
                    set={(v) => put('prop' + n, v)}
                  />
                )}
              </div>
            ),
          )}
          {bindingNames.map((n) => (
            <FieldPickerControl
              key={n}
              label={'绑定 ' + n + '（必填）'}
              value={fieldValue(values['binding' + n])}
              rows={fieldRows}
              onChange={(id) => chooseField('binding' + n, id)}
            />
          ))}
          {requestNames.map((n) => {
            const r = manifest.requests![n] as { payloadSchema: Schema; resultSchema: Schema };
            return (
              <div key={n}>
                {input('req' + n, 'Host 请求 ' + n + '（必填）')}
                <details>
                  <summary>请求参数与返回值</summary>
                  <CodeBlock
                    language="typescript"
                    source={`传入 ${schemaType(r.payloadSchema)}\n返回 ${schemaType(r.resultSchema)}`}
                  />
                </details>
              </div>
            );
          })}
          {args.map((p, i) => (
            <div key={i}>
              <Choice
                label={i + 1 + '. ' + p.name + ' · 来源'}
                value={values['mode' + i] ?? 'field'}
                choices={[
                  ['field', '数据字段'],
                  ['literal', '常量 JSON'],
                ]}
                onChange={(v) => {
                  put('mode' + i, v);
                  put('arg' + i, '');
                }}
              />
              {values['mode' + i] === 'literal' ? (
                input('arg' + i, p.name + ' 常量')
              ) : (
                <FieldPickerControl
                  label={p.name + ' 字段'}
                  value={fieldValue(values['arg' + i])}
                  rows={fieldRows}
                  onChange={(id) => chooseField('arg' + i, id)}
                />
              )}
            </div>
          ))}
          {manifest.restParameter && restCount > 0 && (
            <button className="quiet" onClick={() => put('restCount', String(restCount - 1))}>
              移除末尾参数
            </button>
          )}
          {manifest.restParameter && (
            <button className="quiet" onClick={() => put('restCount', String(restCount + 1))}>
              增加参数
            </button>
          )}
          {hint && <p className="muted">{hint}</p>}
          <button
            disabled={!fragment || !target}
            onClick={() => {
              if (!target) return;
              const { node, append } = target;
              const name = values.expressionName?.trim() ?? '';
              let next: string;
              let pointer = node.path;
              if (target.named) {
                pointer = '/expressions/' + name.replaceAll('~', '~0').replaceAll('/', '~1');
                next = node.path
                  ? addNode(context.tokens, node, fragment, name)
                  : addNode(
                      context.tokens,
                      node,
                      '{' + JSON.stringify(name) + ':' + fragment + '}',
                      'expressions',
                    );
              } else if (append) {
                pointer += '/' + node.children!.length;
                next = addNode(context.tokens, node, fragment, '');
              } else next = editNode(context.tokens, node, fragment);
              setPreview({
                source: text,
                next,
                path: pointer,
                fragment,
                before: append ? undefined : context.tokens.slice(node.start, node.end).join(''),
              });
            }}
          >
            预览改动
          </button>
          {preview && preview.source === text && (
            <section>
              <h3>{preview.before === undefined ? '新增节点' : '替换现有值'}</h3>
              {preview.before !== undefined && (
                <details>
                  <summary>替换前</summary>
                  <JsonEditor text={preview.before} />
                </details>
              )}
              <JsonEditor text={preview.fragment} label="插入预览" />
              <button
                disabled={context.tokens.join('') === preview.next}
                onClick={() => onApply(preview.source, preview.next, preview.path)}
              >
                插入草稿
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
