import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compile } from '@form-engine/compiler';
import { createRuntime } from '@form-engine/runtime';
import {
  createCoreFunctions,
  createDateInclusiveDays,
  createTextIsNonBlank,
  createTravelIsEligibleAge,
  createTravelIsTripRangeAllowed,
  createTravelPersonPremium,
  createTravelRequiresGuardian,
  createTravelTotalPremium,
} from '@form-engine/pure-functions';
import { artifact, definitions, materials } from '../apps/playground/src/demos/catalog';
import { travelDefinition } from '../apps/playground/src/demos/travel/definition';
import { goldenData } from '../apps/playground/src/demos/travel/policy';
import { remoteSelectRequests } from '../packages/materials-react/src/index.ts';
import { defineHostRequests, FormRenderer } from '../packages/renderer-react/src/index.ts';
import '../apps/studio/src/app/studio.css';
import '../apps/studio/src/app/data-schema.css';
import '../apps/studio/src/app/layout-editor.css';
import '../packages/materials-react/src/styles.css';
import './layout-property-editor.css';

const functions = {
  ...createCoreFunctions(artifact),
  ...Object.fromEntries(
    [
      createDateInclusiveDays,
      createTextIsNonBlank,
      createTravelIsEligibleAge,
      createTravelIsTripRangeAllowed,
      createTravelPersonPremium,
      createTravelRequiresGuardian,
      createTravelTotalPremium,
    ]
      .map((make) => make(artifact))
      .map((binding) => [binding.manifest.id, binding]),
  ),
};
const catalog = {
  id: 'travel-acceptance',
  materials: Object.fromEntries(
    definitions.map(({ contract: { manifest } }) => [manifest.id, { manifest, artifact }]),
  ),
  pureFunctions: Object.fromEntries(
    Object.entries(functions).map(([id, { manifest, artifact }]) => [id, { manifest, artifact }]),
  ),
};
const base = { ...travelDefinition, views: { desktop: travelDefinition.views.desktop } };
const studioPath = '/views/desktop';
const escape = (key) => key.replaceAll('~', '~0').replaceAll('/', '~1');
function enumerate(node, path, depth = 0, parentLabel = '', section = '') {
  const material = node.material;
  const label =
    node.props?.title ?? node.props?.label ?? (material && depth ? parentLabel : '') ?? '';
  const title =
    typeof label === 'string' && label
      ? label
      : (material ?? node.scope?.as ?? node.$use ?? '视图节点');
  const group = material === 'section' ? title : section;
  return [
    [path, { node, title, depth, group, editable: !!catalog.materials[material] }],
    ...(node.node ? enumerate(node.node, path + '/node', depth + 1, title, group) : []),
    ...Object.entries(node.slots ?? {}).flatMap(([key, children]) =>
      children.flatMap((child, index) =>
        enumerate(child, path + '/slots/' + escape(key) + '/' + index, depth + 1, title, group),
      ),
    ),
  ];
}
const outline = enumerate(base.views.desktop, studioPath);
const initial = Object.fromEntries(outline.map(([key, { node }]) => [key, node]));
const initialPath = outline.find(
  ([, { node }]) => node.material === 'select' && node.bindings?.value?.path === '/plan',
)[0];
const schema = base.data.schema;
const fieldTitles = new Map(
  outline.flatMap(([, { node, title }]) =>
    Object.values(node.bindings ?? {})
      .filter((ref) => ref.source === 'data' && !ref.scope && ref.path)
      .map((ref) => [ref.path, title]),
  ),
);
const typeNames = {
  string: '文本',
  number: '数值',
  integer: '整数',
  boolean: '布尔值',
  array: '列表',
  object: '对象',
  null: '空值',
};
function schemaTree(shape, path = '', parent = [], key = '') {
  const projected = shape.$ref?.startsWith('#/$defs/')
    ? (schema.$defs[shape.$ref.slice(8)] ?? shape)
    : shape;
  const title =
    fieldTitles.get(path) ||
    { applicant: '投保人', travel: '出行信息', insureds: '被保人列表', '*': '成员' }[key] ||
    key;
  const trail = [...parent, title].filter(Boolean);
  const type = Array.isArray(projected.type)
    ? projected.type.find((entry) => entry !== 'null')
    : projected.type;
  const fields = path
    ? [
        {
          key: path,
          path,
          label: title,
          trail,
          type,
          spec: projected,
          scope: path.includes('/*') ? 'member' : undefined,
        },
      ]
    : [];
  const properties =
    projected.properties &&
    Object.fromEntries(
      Object.entries(projected.properties).map(([id, sub]) => {
        const result = schemaTree(sub, path + '/' + escape(id), trail, id);
        fields.push(...result.fields);
        return [id, result.shape];
      }),
    );
  const item = projected.items && schemaTree(projected.items, path + '/*', trail, '*');
  if (item) fields.push(...item.fields);
  return { shape: { ...projected, title, type, properties, items: item?.shape }, fields };
}
const tree = schemaTree(schema);
const fields = tree.fields;
const fieldPicker = window.createFieldPicker({
  schema: tree.shape,
  fields,
  types: typeNames,
  scopeLabel: (scope) => (scope ? '当前成员' : '表单根'),
});
const requests = defineHostRequests(
  { 'travel.searchCities': remoteSelectRequests.search },
  {
    'travel.searchCities': async ({ query, filterKey }) => ({
      items: query.trim() ? [{ id: filterKey + ':' + query, label: query + '市（模拟）' }] : [],
    }),
  },
);
const names = {
  options: '选项',
  placeholder: '提示文字',
  filterKey: '筛选标识',
  clearable: '允许清空',
  disabled: '禁用',
  readOnly: '只读',
  maxLength: '最长字符数',
  inputMode: '输入方式',
  label: '显示文案',
  startLabel: '开始端标题',
  endLabel: '结束端标题',
  variant: '按钮样式',
};
const enumNames = {
  text: '文本',
  tel: '电话',
  number: '整数',
  decimal: '小数',
  numeric: '整数',
  primary: '主要',
  secondary: '次要',
  danger: '警示',
};
const ref = (path) => ({ source: 'data', path });
const astSource = (value) =>
  value?.$expr?.ref
    ? 'field'
    : value?.$expr !== undefined
      ? 'expression'
      : value && typeof value === 'object' && '$literal' in value && !Array.isArray(value.$literal)
        ? 'json'
        : 'literal';
const defaults = { string: '', number: 0, integer: 0, boolean: false, array: [], object: {} };
const literalValue = (value) => (Array.isArray(value?.$literal) ? value.$literal : value);
const isOptions = (name, spec) => name === 'options' && spec.type === 'array';

function buildPreview(config) {
  function decorate(path) {
    const node = config[path];
    if (!node) return undefined;
    return {
      ...node,
      ...(node.node && { node: decorate(path + '/node') }),
      ...(node.slots && {
        slots: Object.fromEntries(
          Object.entries(node.slots).map(([key, children]) => [
            key,
            children.map((_, index) => decorate(path + '/slots/' + escape(key) + '/' + index)),
          ]),
        ),
      }),
    };
  }
  return compile({
    catalog,
    definition: { ...base, views: { desktop: decorate(studioPath) } },
    target: { profile: 'desktop' },
  });
}

function RealPreview({ config, section, label }) {
  const data = useRef(goldenData());
  const viewport = useRef(null);
  const [session, setSession] = useState();
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const result = buildPreview(config);
        if (!result.success) {
          setStatus(
            result.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
              '请检查属性取值。',
          );
          return;
        }
        const next = createRuntime({
          prepared: result.prepared,
          data: structuredClone(data.current),
          functions,
          host: {
            validators: {
              'travel.checkEligibility': () => ({ result: Promise.resolve([]), cancel() {} }),
            },
            events: {
              'travel.saveDraft': () => setMessage('模拟保存草稿完成。'),
              'travel.submit': () => setMessage('已收到试填提交。'),
            },
          },
        });
        const observe = next.observe([ref('')], () => {
          data.current = structuredClone(next.snapshot());
        });
        setSession({ runtime: next, observe, prepared: result.prepared });
        setStatus('');
      } catch (error) {
        setStatus(error.message);
      }
    }, 110);
    return () => clearTimeout(timer);
  }, [config]);
  useEffect(
    () => () => {
      session?.observe.dispose();
      session?.runtime.dispose();
    },
    [session],
  );
  useEffect(() => {
    if (!session || !viewport.current) return;
    const root = viewport.current;
    const heading = [...root.querySelectorAll('h2,h3')].find(
      (item) => item.textContent.trim() === section,
    );
    const area = heading?.closest('section') ?? root;
    const fieldLabel = [...area.querySelectorAll('.fe-field > label')].find(
      (item) => item.textContent.replace(/\s*\*$/, '').trim() === label,
    );
    const target = fieldLabel?.closest('.fe-field') ?? heading;
    if (target) {
      root.scrollTop +=
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top -
        (fieldLabel ? 120 : 14);
    }
  }, [section, label, Boolean(session)]);
  useEffect(() => {
    const root = viewport.current;
    if (!root || !session) return;
    const marker = [...root.querySelectorAll('.fe-field > label')]
      .find((item) => item.textContent.replace(/\s*\*$/, '').trim() === label)
      ?.closest('.fe-field');
    if (!marker) return;
    marker.setAttribute('data-inspecting', '');
    return () => marker.removeAttribute('data-inspecting');
  }, [label, session]);
  return (
    <div className="travel-preview-scroll" ref={viewport}>
      {status && (
        <p className="preview-error" role="alert">
          预览保留上次可用结果。{status}
        </p>
      )}
      {session ? (
        <FormRenderer
          prepared={session.prepared}
          runtime={session.runtime}
          materials={materials}
          requests={requests}
        />
      ) : (
        !status && <p role="status">正在准备表单…</p>
      )}
      {message && (
        <p role="status" className="preview-message">
          {message}
        </p>
      )}
    </div>
  );
}

function FieldInput({ label, allowed, value, onChange, expected }) {
  const anchor = useRef(null);
  useEffect(() => {
    const view = anchor.current;
    const picker = fieldPicker.input({
      label,
      available: allowed,
      value,
      expected,
    });
    picker.addEventListener('change', () => onChange(picker.value));
    view.replaceChildren(picker);
  }, [label, allowed, value, onChange, expected]);
  return <div ref={anchor} className="read-field" />;
}

function OptionRows({ values, onChange }) {
  function replace(index, key, value) {
    onChange(values.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }
  function move(index, by) {
    const next = [...values];
    const target = index + by;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  const duplicate = values.some(
    (row, i) => row.id && values.findIndex((other) => other.id === row.id) !== i,
  );
  return (
    <div className="option-list">
      <p className="hint">用户看到名称，表单保存写入值。</p>
      <div className="option-labels" aria-hidden="true">
        <span>显示名称</span>
        <span>写入值</span>
      </div>
      <ol>
        {values.map((row, i) => (
          <li key={i}>
            <div className="option-inputs">
              <input
                aria-label={'选项 ' + (i + 1) + ' 显示名称'}
                placeholder="显示名称"
                value={row.label}
                onChange={(e) => replace(i, 'label', e.target.value)}
              />
              <input
                aria-label={'选项 ' + (i + 1) + ' 写入值'}
                placeholder="写入值"
                value={row.id}
                onChange={(e) => replace(i, 'id', e.target.value)}
              />
            </div>
            <div className="option-actions">
              <button
                aria-label={'上移选项 ' + (i + 1)}
                title="上移"
                disabled={!i}
                onClick={() => move(i, -1)}
              >
                ↑
              </button>
              <button
                aria-label={'下移选项 ' + (i + 1)}
                title="下移"
                disabled={i === values.length - 1}
                onClick={() => move(i, 1)}
              >
                ↓
              </button>
              <button
                aria-label={'删除选项 ' + (i + 1)}
                title="删除"
                onClick={() => onChange(values.filter((_, at) => at !== i))}
              >
                移除
              </button>
            </div>
          </li>
        ))}
      </ol>
      {duplicate && (
        <p className="notice" role="status">
          有选项使用了相同的写入值。
        </p>
      )}
      {!values.length && <p className="hint">当前无选项</p>}
      <button
        className="add-option"
        onClick={() => {
          let number = values.length + 1;
          while (values.some((row) => row.id === 'option-' + number)) number++;
          onChange([...values, { id: 'option-' + number, label: '新选项' }]);
        }}
      >
        ＋ 添加选项
      </button>
    </div>
  );
}

function ConfigValue({ name, spec: contract, value, onChange }) {
  const spec = Array.isArray(contract.type)
    ? { ...contract, type: contract.type.find((type) => type !== 'null') }
    : contract;
  const title = names[name] ?? name;
  const current = astSource(value);
  const [source, setSource] = useState(current);
  const [fixedDraft, setFixedDraft] = useState(() =>
    current === 'literal' ? literalValue(value) : undefined,
  );
  const [code, setCode] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [codeError, setCodeError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const candidates = fields.filter(
    (field) =>
      !field.scope &&
      spec.type !== 'array' &&
      (field.type === spec.type || (spec.type === 'number' && field.type === 'integer')),
  );
  const fixed = source === 'literal';
  const literal =
    (current === 'literal' ? literalValue(value) : fixedDraft) ??
    spec.enum?.[0] ??
    defaults[spec.type];
  const setFixed = (next) => onChange(isOptions(name, spec) ? { $literal: next } : next);
  const constant = spec.enum ? (
    <select
      aria-label={title}
      value={literal}
      onChange={(e) => onChange(spec.enum.find((entry) => String(entry) === e.target.value))}
    >
      {spec.enum.map((entry) => (
        <option key={String(entry)} value={entry}>
          {enumNames[entry] ?? entry}
        </option>
      ))}
    </select>
  ) : spec.type === 'boolean' ? (
    <input
      type="checkbox"
      role="switch"
      aria-label={title}
      checked={literal}
      onChange={(e) => onChange(e.target.checked)}
    />
  ) : spec.type === 'array' ? (
    <OptionRows values={literal} onChange={setFixed} />
  ) : (
    <input
      aria-label={title}
      type={['integer', 'number'].includes(spec.type) ? 'number' : 'text'}
      min={spec.minimum}
      max={spec.maximum}
      value={literal ?? ''}
      onChange={(e) => {
        if (e.target.type === 'number') {
          if (e.target.value !== '' && e.target.validity.valid) onChange(e.target.valueAsNumber);
        } else onChange(e.target.value);
      }}
    />
  );
  function switchSource(next) {
    if (current === 'literal' && next !== 'literal') setFixedDraft(literalValue(value));
    setCodeError('');
    setSource(next);
    if (next === 'literal') setFixed(literal);
    if (next === 'expression')
      setCode(
        JSON.stringify(
          current === 'expression'
            ? value
            : {
                $expr:
                  spec.type === 'boolean'
                    ? { op: 'core.eq', args: [{ ref: ref('/travel/countryCode') }, 'US'] }
                    : { literal: literal ?? null },
              },
          null,
          2,
        ),
      );
    if (next === 'json')
      setCode(JSON.stringify(current === 'json' ? value.$literal : literal, null, 2));
  }
  const sourceNames = {
    literal: '固定值',
    field: '读取字段',
    expression: '表达式',
    json: 'JSON 字面量',
  };
  const sourceSelect = (
    <label className="source-control">
      <span>取值方式</span>
      <select
        aria-label={title + '取值方式'}
        value={source}
        onChange={(e) => switchSource(e.target.value)}
      >
        {Object.entries(sourceNames).map(([key, label]) => (
          <option key={key} value={key} disabled={key === 'field' && !candidates.length}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
  const editor = (
    <>
      {!fixed && source === 'field' && (
        <FieldInput
          label={title + '读取字段'}
          allowed={candidates}
          expected={typeNames[spec.type]}
          value={value?.$expr?.ref?.path}
          onChange={(path) => onChange({ $expr: { ref: ref(path) } })}
        />
      )}
      {!fixed && (source === 'expression' || source === 'json') && (
        <div className="expression-input">
          <textarea
            aria-label={title + (source === 'json' ? ' JSON' : '表达式')}
            rows={5}
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError('');
            }}
          />
          <button
            className="quiet"
            onClick={() => {
              try {
                const parsed = JSON.parse(code);
                if (
                  source === 'expression' &&
                  (!parsed || typeof parsed !== 'object' || !Object.hasOwn(parsed, '$expr'))
                )
                  throw Error('请填写含 $expr 的协议表达式。');
                onChange(source === 'json' ? { $literal: parsed } : parsed);
                setCodeError('');
              } catch (error) {
                setCodeError(error.message);
              }
            }}
          >
            更新试算
          </button>
          {codeError && (
            <p role="alert" className="notice">
              {codeError}
            </p>
          )}
        </div>
      )}
    </>
  );
  if (spec.type === 'array')
    return (
      <details
        className="options-panel"
        open={expanded}
        onToggle={(e) => setExpanded(e.currentTarget.open)}
      >
        <summary>
          <strong>选项设置</strong>
          <span>
            {current === 'literal'
              ? (Array.isArray(literalValue(value)) ? literalValue(value).length : 0) + ' 项'
              : sourceNames[current]}
          </span>
        </summary>
        {expanded && (
          <div className="options-body">
            {sourceSelect}
            {!candidates.length && fixed && (
              <p className="hint">当前数据模型没有可读取的选项列表字段。</p>
            )}
            {fixed ? constant : editor}
          </div>
        )}
      </details>
    );
  return (
    <div className="property-row">
      <div className="property-label">
        <span>{title}</span>
        <button
          className="source-trigger"
          aria-expanded={expanded}
          aria-label={title + '来源设置'}
          onClick={() => setExpanded(!expanded)}
        >
          {sourceNames[source]} <span aria-hidden="true">▾</span>
        </button>
      </div>
      {fixed && constant}
      {(expanded || !fixed) && (
        <div className="source-panel">
          {sourceSelect}
          {editor}
        </div>
      )}
    </div>
  );
}

function App() {
  const [active, setActive] = useState(initialPath);
  const [config, setConfig] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const [rail, setRail] = useState('outline');
  const [source, showSource] = useState(false);
  const [arrange, setArrange] = useState(false);
  const info = outline.find(([path]) => path === active)[1];
  const node = config[active];
  const manifest = catalog.materials[node.material]?.manifest;
  const changed = node !== applied[active];
  const update = (patch) => {
    setNotice('');
    setConfig((previous) => ({ ...previous, [active]: { ...previous[active], ...patch } }));
  };
  function select(path) {
    setActive(path);
    setNotice('');
  }
  const layoutTree = (name) => (
    <nav className="travel-outline-nodes" aria-label={name}>
      {outline.map(([path, { title, depth, node }]) => (
        <button
          key={path}
          aria-pressed={active === path}
          title={path}
          style={{ paddingInlineStart: 8 + Math.min(depth, 6) * 9 }}
          onClick={() => select(path)}
        >
          <span>{title}</span>
          <small>{node.material ?? (node.scope ? '作用域' : '模板')}</small>
        </button>
      ))}
    </nav>
  );
  return (
    <main className="travel-workbench">
      <header className="travel-workbench-title">
        <h1>家庭出行</h1>
        <span>引用 Studio「家庭出行」模板 · 属性原型</span>
      </header>
      <section className="design-source travel-layout-module">
        <nav className="workbench-tabs semantic-tabs" aria-label="配置编辑视图">
          <button disabled>字段</button>
          <button aria-pressed={!source} onClick={() => showSource(false)}>
            布局
          </button>
          <button disabled>联动</button>
          <button disabled>校验</button>
          <button
            className="source-toggle"
            aria-pressed={source}
            onClick={() => showSource(!source)}
          >
            {source ? '返回布局' : 'JSON 原文'}
          </button>
        </nav>
        {source ? (
          <pre className="travel-raw">{active + '\n\n' + JSON.stringify(node, null, 2)}</pre>
        ) : (
          <section className="visual-layout" aria-label="布局编辑器">
            <header className="layout-bar">
              <h2>布局</h2>
              <label>
                当前布局{' '}
                <select aria-label="当前布局">
                  <option>desktop</option>
                </select>
              </label>
              <code>/views</code>
            </header>
            <div className="layout-panes workspace">
              <div className="outline layout-outline">
                <div className="travel-rail-tabs" role="group" aria-label="左侧面板">
                  <button
                    className="quiet"
                    aria-pressed={rail === 'outline'}
                    onClick={() => setRail('outline')}
                  >
                    视图大纲
                  </button>
                  <button
                    className="quiet"
                    aria-pressed={rail === 'fields'}
                    onClick={() => setRail('fields')}
                  >
                    字段结构
                  </button>
                </div>
                {rail === 'outline' ? (
                  layoutTree('视图大纲')
                ) : (
                  <nav aria-label="字段结构">
                    {fields.map(({ path, label, trail, type }) => (
                      <div
                        key={path}
                        style={{ paddingInlineStart: Math.min(trail.length - 1, 5) * 10 }}
                      >
                        <strong>{label}</strong> <small>{typeNames[type]}</small>
                        <code>{path}</code>
                      </div>
                    ))}
                  </nav>
                )}
              </div>
              <section className="layout-paper travel-paper" aria-label="布局画布">
                <header className="layout-paper-bar">
                  <h3>desktop</h3>
                  <div className="layout-view-switch" role="group" aria-label="画布模式">
                    <button
                      className="quiet"
                      aria-pressed={!arrange}
                      onClick={() => setArrange(false)}
                    >
                      真实预览
                    </button>
                    <button
                      className="quiet"
                      aria-pressed={arrange}
                      onClick={() => setArrange(true)}
                    >
                      编排
                    </button>
                  </div>
                </header>
                {arrange ? (
                  layoutTree('编排结构')
                ) : (
                  <section className="layout-live" aria-label="真实表单预览">
                    <RealPreview config={config} section={info.group} label={info.title} />
                  </section>
                )}
              </section>
              <aside className="inspector layout-inspector travel-inspector" aria-label="节点设置">
                <header className="inspector-head">
                  <div>
                    <h2>{info.title}</h2>
                    <p>{node.material ?? (node.scope ? '作用域' : '视图模板')}</p>
                  </div>
                  <button className="text-button" onClick={() => showSource(true)}>
                    在 JSON 中定位
                  </button>
                </header>
                <div className="inspector-content" key={active + ':' + revision}>
                  {manifest?.propsSchema?.properties && (
                    <section aria-label="显示与选项">
                      <h3>显示与选项</h3>
                      {Object.entries(manifest.propsSchema.properties).map(([name, spec]) =>
                        spec?.type ? (
                          <ConfigValue
                            key={name}
                            name={name}
                            spec={spec}
                            value={node.props?.[name]}
                            onChange={(value) =>
                              update({ props: { ...node.props, [name]: value } })
                            }
                          />
                        ) : (
                          <button className="quiet" key={name} onClick={() => showSource(true)}>
                            {name} · 查看 JSON
                          </button>
                        ),
                      )}
                    </section>
                  )}
                  {Object.keys(node.bindings ?? {}).length > 0 && (
                    <section aria-label="数据绑定">
                      <h3>数据绑定</h3>
                      {Object.entries(node.bindings).map(([port, binding]) => {
                        const type = fields.find((entry) => entry.path === binding.path)?.type;
                        const allowed = fields.filter(
                          (entry) => !entry.scope && entry.type === type,
                        );
                        return (
                          <div className="binding" key={port}>
                            <span>
                              {{ value: '写回字段', start: '开始日期字段', end: '结束日期字段' }[
                                port
                              ] ?? port}
                            </span>
                            {binding.scope ||
                            binding.source !== 'data' ||
                            !type ||
                            node.material === 'field' ? (
                              <code>
                                {[binding.scope, binding.path || '（自身）']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </code>
                            ) : (
                              <FieldInput
                                label={'更换' + port + '字段'}
                                allowed={allowed}
                                value={binding.path}
                                expected={typeNames[type]}
                                onChange={(path) =>
                                  update({ bindings: { ...node.bindings, [port]: ref(path) } })
                                }
                              />
                            )}
                          </div>
                        );
                      })}
                    </section>
                  )}
                  <details className="inspector-section">
                    <summary>
                      <strong>显示规则</strong>
                      <span>{node.scope ? '局部作用域' : '视图位置'}</span>
                    </summary>
                    <p className="hint">{active}</p>
                    {node.scope && <pre>{JSON.stringify(node.scope, null, 2)}</pre>}
                  </details>
                  {(node.on || node.requests) && (
                    <details className="inspector-section">
                      <summary>
                        <strong>事件与请求</strong>
                        <span>
                          {Object.keys(node.on ?? {}).length +
                            Object.keys(node.requests ?? {}).length}{' '}
                          项
                        </span>
                      </summary>
                      {Object.entries(node.on ?? {}).map(([name, event]) => (
                        <p key={name}>
                          <code>
                            {name} · {event.event ?? event.type}
                          </code>
                        </p>
                      ))}
                      {Object.entries(node.requests ?? {}).map(([name, request]) => (
                        <p key={name}>
                          <code>
                            {name} · {request.request}
                          </code>
                        </p>
                      ))}
                    </details>
                  )}
                </div>
                <footer className="inspector-footer">
                  <span role="status">{notice || (changed ? '有未应用的修改' : '已应用')}</span>
                  <button
                    className="quiet"
                    disabled={!changed}
                    onClick={() => {
                      setConfig((previous) => ({ ...previous, [active]: applied[active] }));
                      setRevision(revision + 1);
                      setNotice('');
                    }}
                  >
                    还原
                  </button>
                  <button
                    className="primary"
                    disabled={!changed}
                    onClick={() => {
                      const result = buildPreview(config);
                      if (!result.success) {
                        setNotice('请修正预览中的问题');
                        return;
                      }
                      setApplied((before) => ({ ...before, [active]: node }));
                      setNotice('已应用修改');
                    }}
                  >
                    应用
                  </button>
                </footer>
              </aside>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
createRoot(document.getElementById('property-editor')).render(<App />);
