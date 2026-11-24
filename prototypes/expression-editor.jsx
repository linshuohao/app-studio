import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { compile } from '@form-engine/compiler';
import { createRuntime } from '@form-engine/runtime';
import {
  createCoreFunctions,
  createDateInclusiveDays,
  createTravelRequiresGuardian,
} from '@form-engine/pure-functions';
import { artifact, definitions } from '../apps/playground/src/demos/catalog';
import { travelDefinition } from '../apps/playground/src/demos/travel/definition';
import { agePolicy } from '../apps/playground/src/demos/travel/policy';
import './layout-property-editor.css';
import './expression-editor.css';

const registered = [createDateInclusiveDays, createTravelRequiresGuardian].map((factory) =>
  factory(artifact),
);
const functions = {
  ...createCoreFunctions(artifact),
  ...Object.fromEntries(registered.map((binding) => [binding.manifest.id, binding])),
};
const catalog = {
  id: 'expression-editor-prototype',
  materials: Object.fromEntries(
    definitions.map(({ contract: { manifest } }) => [manifest.id, { manifest, artifact }]),
  ),
  pureFunctions: Object.fromEntries(
    Object.entries(functions).map(([id, { manifest }]) => [id, { manifest, artifact }]),
  ),
};

const ref = (path, scope) => ({ source: 'data', path, ...(scope && { scope }) });
const read = (path, scope) => ({ ref: ref(path, scope) });
const call = (op, ...args) => ({ op, args });
const age = read('/age', 'insured');
const plan = read('/plan');
const days = { use: 'tripDays' };
const binder = { from: ref('/insureds'), as: 'insured', mode: 'each' };
const names = travelDefinition.expressions;
const cmp = () => call('core.lt', age, 18);
const initial = call(
  'core.or',
  cmp(),
  call('core.and', call('core.eq', plan, 'plus'), call('core.eq', days, 2)),
);
const functionNames = {
  'core.lt': '小于',
  'core.lte': '小于或等于',
  'core.gt': '大于',
  'core.gte': '大于或等于',
  'core.eq': '等于',
  'core.ne': '不等于',
  'core.exists': '存在',
  'core.not': '取反',
  'travel.requiresGuardian': '是否需要监护人',
  'date.inclusiveDays': '日期天数',
};
const comparisons = ['core.lt', 'core.lte', 'core.gt', 'core.gte', 'core.eq', 'core.ne'];
const types = {
  string: '文本',
  number: '数字',
  integer: '整数',
  boolean: '布尔值',
  null: 'null',
  array: '列表',
  object: '对象',
};
// The prototype selects a small set of actual travel fields and uses the established field-tree widget.
const schema = {
  type: 'object',
  properties: {
    plan: { title: '出行方案', type: 'string' },
    travel: {
      title: '出行信息',
      type: 'object',
      properties: {
        startDate: { title: '开始日期', type: 'string' },
        endDate: { title: '结束日期', type: 'string' },
      },
    },
    insureds: {
      title: '被保人列表',
      type: 'array',
      items: {
        title: '当前被保险人',
        type: 'object',
        properties: { age: { title: '年龄', type: 'integer' } },
      },
    },
  },
};
const fields = [
  {
    key: 'age',
    path: '/insureds/*/age',
    label: '年龄',
    trail: ['被保人列表', '当前被保险人', '年龄'],
    type: 'integer',
    scope: 'insured',
    expression: age,
  },
  {
    key: 'plan',
    path: '/plan',
    label: '出行方案',
    trail: ['出行方案'],
    type: 'string',
    expression: plan,
  },
  {
    key: 'start',
    path: '/travel/startDate',
    label: '开始日期',
    trail: ['出行信息', '开始日期'],
    type: 'string',
    expression: read('/travel/startDate'),
  },
  {
    key: 'end',
    path: '/travel/endDate',
    label: '结束日期',
    trail: ['出行信息', '结束日期'],
    type: 'string',
    expression: read('/travel/endDate'),
  },
];
const picker = window.createFieldPicker({
  schema,
  fields,
  types,
  scopeLabel: (name) => (name ? '当前成员' : '表单根'),
});
const group = (value) => value?.op === 'core.and' || value?.op === 'core.or';
const leaf = (value) =>
  value === null ||
  typeof value !== 'object' ||
  'literal' in value ||
  'ref' in value ||
  'use' in value;
const fieldFor = (value) =>
  fields.find(
    ({ expression }) =>
      value?.ref?.source === 'data' &&
      value.ref.scope === expression.ref.scope &&
      value.ref.path === expression.ref.path,
  );
const json = (value) => JSON.stringify(value, null, 2);
const typeLabel = (schema) => {
  const type = schema?.type;
  return type
    ? [type]
        .flat()
        .map((kind) => types[kind] ?? kind)
        .join(' / ')
    : '任意 JSON 值';
};

function useField(label, value, onChange, accepted) {
  const anchor = useRef(null);
  useEffect(() => {
    const el = anchor.current;
    if (!el) return;
    const control = picker.input({
      label,
      available: accepted,
      scope: 'insured',
      value: fieldFor(value)?.key ?? '',
    });
    control.addEventListener('change', () => {
      const next = fields.find((field) => field.key === control.value);
      if (next) onChange(next.expression);
    });
    el.replaceChildren(control);
  }, [label, value, onChange, accepted]);
  return anchor;
}

function Parameter({ label, title = label, spec, value, onChange }) {
  const source = value?.ref ? 'field' : value?.use ? 'named' : 'fixed';
  const literal = value && typeof value === 'object' && 'literal' in value ? value.literal : value;
  const accepted = fields.filter(
    (field) =>
      !spec?.type ||
      [spec.type].flat().includes(field.type) ||
      (field.type === 'integer' && [spec.type].flat().includes('number')),
  );
  const expectedTypes = [spec?.type].flat();
  const acceptsDays =
    !spec?.type ||
    ['integer', 'null'].every(
      (type) =>
        expectedTypes.includes(type) || (type === 'integer' && expectedTypes.includes('number')),
    );
  const anchor = useField(label + ' · 选字段', value, onChange, accepted);
  const number = typeof literal === 'number' || spec?.type === 'number' || spec?.type === 'integer';
  const fixed =
    typeof literal === 'boolean' || literal === null ? (
      <select
        aria-label={label + '固定值'}
        value={JSON.stringify(literal)}
        onChange={(e) => onChange(JSON.parse(e.target.value))}
      >
        <option value="true">true</option>
        <option value="false">false</option>
        <option value="null">null</option>
      </select>
    ) : typeof literal === 'object' ? (
      <span className="expr-chip">对象常量 · 从此节点 JSON 编辑</span>
    ) : (
      <input
        aria-label={label + '固定值'}
        type={number ? 'number' : 'text'}
        value={literal ?? ''}
        onChange={(e) => {
          if (!number || e.target.value !== '')
            onChange(number ? e.target.valueAsNumber : e.target.value);
        }}
      />
    );
  return (
    <div className="expr-parameter">
      <div className="expr-parameter-label">
        <strong>{title}</strong>
        <small>{typeLabel(spec)}</small>
      </div>
      <select
        aria-label={label + '取值方式'}
        value={source}
        onChange={(e) => {
          if (e.target.value === 'field' && accepted[0]) onChange(accepted[0].expression);
          else if (e.target.value === 'named') onChange(days);
          else onChange(number ? 18 : spec?.type === 'boolean' ? true : '');
        }}
      >
        <option value="fixed">固定值</option>
        <option value="field" disabled={!accepted.length}>
          字段引用
        </option>
        <option value="named" disabled={!acceptsDays}>
          全局表达式
        </option>
      </select>
      {source === 'field' ? (
        <div ref={anchor} />
      ) : source === 'named' ? (
        <select
          aria-label={label + '全局表达式'}
          value={value.use}
          onChange={(e) => onChange({ use: e.target.value })}
        >
          {!Object.hasOwn(names, value.use) && (
            <option value={value.use}>{value.use}（未定义）</option>
          )}
          <option value="tripDays">出行天数 · tripDays</option>
        </select>
      ) : (
        fixed
      )}
    </div>
  );
}

function editorKind(node) {
  if (group(node)) return 'group';
  if (!node?.op) return leaf(node) ? 'value' : 'json';
  if (!node.args?.every(leaf) || !Object.hasOwn(functionNames, node.op)) return 'json';
  return comparisons.includes(node.op) ? 'compare' : 'function';
}

function ExpressionNode({
  node,
  onChange,
  depth = 0,
  path = [],
  label,
  onDelete,
  onJson,
  deleteLabel,
}) {
  const kind = editorKind(node);
  const replace = (index, value) =>
    onChange({ ...node, args: node.args.map((old, i) => (i === index ? value : old)) });
  const canGroup = depth < 2;
  const visual = kind !== 'json' && (kind !== 'group' || canGroup);
  return (
    <article
      id={nodeId(path)}
      tabIndex={-1}
      data-operator={visual && kind === 'group' ? node.op.slice(5) : undefined}
      className={'expr-node ' + (kind === 'group' && visual ? 'expr-group' : 'expr-leaf')}
    >
      <div className="expr-node-bar">
        <strong>
          {depth === 0
            ? '条件'
            : kind === 'group' && visual
              ? '条件组'
              : '条件 ' + (path.at(-1) + 1)}
        </strong>
        {visual && kind === 'group' && (
          <select
            className="expr-group-operator"
            aria-label={label + '逻辑'}
            value={node.op}
            onChange={(e) => onChange({ ...node, op: e.target.value })}
          >
            <option value="core.and">满足全部（AND）</option>
            <option value="core.or">满足任一（OR）</option>
          </select>
        )}
        {visual && kind !== 'group' && (
          <select
            aria-label={label + '类型'}
            value={kind}
            onChange={(e) => {
              const value = e.target.value;
              onChange(
                value === 'group'
                  ? call('core.and', node, cmp())
                  : value === 'compare'
                    ? cmp()
                    : value === 'function'
                      ? call('travel.requiresGuardian', age, { literal: agePolicy })
                      : true,
              );
            }}
          >
            <option value="compare">比较条件</option>
            <option value="function">调用纯函数</option>
            <option value="value">布尔值或引用</option>
            {canGroup && <option value="group">逻辑分组</option>}
          </select>
        )}
        <div className="expr-node-actions">
          <button
            type="button"
            className="quiet"
            aria-label={label + '编辑 JSON'}
            onClick={() => onJson(node, onChange, label, path)}
          >
            编辑 JSON
          </button>
          {onDelete && (
            <button
              type="button"
              className="expr-delete"
              aria-label={label + deleteLabel}
              onClick={onDelete}
            >
              {deleteLabel}
            </button>
          )}
        </div>
      </div>
      {!visual ? (
        <p className="expr-muted">
          复杂表达式 · <code>{node?.op ?? '协议结构'}</code> · 打开此段 JSON 编辑
        </p>
      ) : kind === 'group' ? (
        <>
          <div className="expr-children">
            {node.args.map((item, index) => (
              <ExpressionNode
                key={index}
                node={item}
                onChange={(next) => replace(index, next)}
                depth={depth + 1}
                path={[...path, index]}
                label={label + ' / ' + (index + 1)}
                onJson={onJson}
                deleteLabel={node.args.length === 2 ? '移除并解组' : '移除'}
                onDelete={() => {
                  const args = node.args.filter((_, i) => i !== index);
                  onChange(args.length === 1 ? args[0] : { ...node, args });
                }}
              />
            ))}
          </div>
          <div className="expr-add">
            <button
              type="button"
              className="quiet"
              onClick={() => onChange({ ...node, args: [...node.args, cmp()] })}
            >
              ＋ 添加条件
            </button>
            {depth === 0 && (
              <button
                type="button"
                className="quiet"
                onClick={() =>
                  onChange({
                    ...node,
                    args: [...node.args, call('core.and', cmp(), call('core.eq', plan, 'plus'))],
                  })
                }
              >
                ＋ 添加分组
              </button>
            )}
          </div>
        </>
      ) : kind === 'compare' ? (
        <>
          <label className="expr-method">
            <strong>比较方式</strong>
            <select
              aria-label={label + '比较方式'}
              value={node.op}
              onChange={(e) => onChange({ ...node, op: e.target.value })}
            >
              {comparisons.map((op) => (
                <option key={op} value={op}>
                  {functionNames[op]}
                </option>
              ))}
            </select>
          </label>
          <div className="expr-parameters">
            <Parameter
              label={label + ' 左值'}
              title="左边"
              spec={functions[node.op].manifest.parameters[0].schema}
              value={node.args[0]}
              onChange={(next) => replace(0, next)}
            />
            <Parameter
              label={label + ' 右值'}
              title="右边"
              spec={functions[node.op].manifest.parameters[1].schema}
              value={node.args[1]}
              onChange={(next) => replace(1, next)}
            />
          </div>
        </>
      ) : kind === 'function' ? (
        <>
          <label className="expr-method">
            <span className="expr-parameter-label">
              <strong>纯函数</strong>
              <small>返回 {typeLabel(functions[node.op].manifest.returns)}</small>
            </span>
            <select
              aria-label={label + '纯函数'}
              value={node.op}
              onChange={(e) => {
                const op = e.target.value;
                onChange(
                  op === 'travel.requiresGuardian'
                    ? call(op, age, { literal: agePolicy })
                    : call(op, age),
                );
              }}
            >
              {[
                'travel.requiresGuardian',
                'core.exists',
                'core.not',
                ...(node.op === 'date.inclusiveDays' ? [node.op] : []),
              ].map((op) => (
                <option key={op} value={op}>
                  {functionNames[op]}
                </option>
              ))}
            </select>
          </label>
          <div className="expr-parameters">
            {node.args.map((value, i) => {
              const manifest = functions[node.op].manifest;
              const parameter = manifest.parameters[i] ?? manifest.restParameter;
              return (
                <Parameter
                  key={i}
                  label={label + ' · ' + (parameter?.name ?? '参数 ' + (i + 1))}
                  title={parameter?.name ?? '参数 ' + (i + 1)}
                  spec={parameter?.schema}
                  value={value}
                  onChange={(next) => replace(i, next)}
                />
              );
            })}
          </div>
        </>
      ) : (
        <Parameter
          label={label + ' 值'}
          title="条件值"
          spec={{ type: 'boolean' }}
          value={node}
          onChange={onChange}
        />
      )}
    </article>
  );
}

function check(expression, placement) {
  const condition = {
    material: 'condition',
    props: { visible: placement === 'visible' ? { $expr: expression } : true },
    slots: { default: [] },
  };
  const definition = {
    protocolVersion: '1',
    id: 'expression-editor-sample',
    version: 'draft',
    data: { schema: travelDefinition.data.schema },
    expressions: names,
    views: { desktop: { scope: binder, node: condition } },
    ...(placement === 'assert' && {
      constraints: [
        {
          id: 'example-assert',
          kind: 'internal',
          scope: binder,
          assert: expression,
          issue: {
            target: ref('/age', 'insured'),
            code: 'SAMPLE',
            message: { text: '当前断言未通过' },
          },
        },
      ],
    }),
  };
  return compile({ definition, catalog, target: { profile: 'desktop' } });
}

const nodeId = (path) => 'expression-node-' + (path.join('-') || 'root');
function inputFields(node, out = new Set(), visited = new Set()) {
  const field = fieldFor(node);
  if (field) out.add(field.key);
  if (node?.use && Object.hasOwn(names, node.use) && !visited.has(node.use)) {
    visited.add(node.use);
    inputFields(names[node.use], out, visited);
  }
  for (const child of node?.args ?? []) inputFields(child, out, visited);
  return out;
}
const initialSample = { age: '16', plan: 'basic', start: '2028-02-28', end: '2028-02-29' };
function operandText(node) {
  if (node?.ref) return fieldFor(node)?.label ?? node.ref.path;
  if (node?.use) return node.use === 'tripDays' ? '出行天数' : node.use;
  if (node?.op) return functionNames[node.op] ?? node.op;
  if (node?.literal !== undefined) return '固定 JSON';
  if (node === 'basic') return '基础方案';
  if (node === 'plus') return '升级方案';
  return json(node) ?? '待填写';
}
function nodeLabel(node) {
  if (node?.op === 'core.and') return '满足全部';
  if (node?.op === 'core.or') return '满足任一';
  if (comparisons.includes(node?.op) && node.args.length === 2) {
    return [operandText(node.args[0]), functionNames[node.op], operandText(node.args[1])].join(' ');
  }
  return operandText(node);
}
const stateOf = (value) =>
  value.kind === 'value'
    ? value.value
      ? 'passed'
      : 'failed'
    : value.kind === 'missing'
      ? 'missing'
      : 'error';
const resultLabels = {
  passed: '成立',
  failed: '不成立',
  missing: '缺少输入',
  error: '求值错误',
  skipped: '短路跳过',
  blocked: '未执行',
};

// The Runtime evaluates the actual expression. This trace projects its short-circuit order onto the condition tree.
function runTrace(node, evaluate, whole) {
  const entries = new Map();
  function visit(current, path, skip, evaluated) {
    const value = skip ? undefined : (evaluated ?? evaluate(current));
    const state = skip ?? stateOf(value);
    entries.set(nodeId(path), state);
    if (group(current)) {
      let remaining = skip;
      current.args.forEach((child, i) => {
        const reached = visit(child, [...path, i], remaining);
        if (remaining) return;
        if (reached === 'missing' || reached === 'error') remaining = 'blocked';
        if (
          (current.op === 'core.and' && reached === 'failed') ||
          (current.op === 'core.or' && reached === 'passed')
        )
          remaining = 'skipped';
      });
    }
    return state;
  }
  visit(node, [], undefined, whole);
  return entries;
}

function ConditionDiagram({ node, trace, path = [] }) {
  const id = nodeId(path);
  const state = trace?.get(id);
  const operator = group(node) ? node.op.slice(5).toUpperCase() : undefined;
  return (
    <li>
      <button
        type="button"
        data-operator={operator?.toLowerCase()}
        data-state={state}
        className={'expr-diagram-node' + (operator ? ' expr-diagram-group' : '')}
        onClick={() => {
          const target = document.getElementById(id);
          target?.focus({ preventScroll: true });
          target?.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }}
      >
        {operator && <span className="expr-diagram-op">{operator}</span>}
        <span className="expr-diagram-title">{nodeLabel(node)}</span>
        {state && <span className={'expr-state ' + state}>{resultLabels[state]}</span>}
      </button>
      {operator && path.length < 2 && (
        <ul>
          {node.args.map((item, i) => (
            <ConditionDiagram key={i} node={item} trace={trace} path={[...path, i]} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Verification({ result, node, placement }) {
  const [sample, setSample] = useState(initialSample);
  const [answer, setAnswer] = useState();
  const used = inputFields(node);
  const activeFields = fields.filter((field) => used.has(field.key));
  const current =
    answer?.node === node && answer.sample === sample && answer.placement === placement
      ? answer
      : undefined;
  function run() {
    if (!result.success) return;
    const runtime = createRuntime({
      prepared: result.prepared,
      data: {
        ...(sample.plan && { plan: sample.plan }),
        travel: {
          ...(sample.start && { startDate: sample.start }),
          ...(sample.end && { endDate: sample.end }),
        },
        insureds: [sample.age === '' ? {} : { age: Number(sample.age) }],
      },
      functions,
    });
    try {
      const [scope] = runtime.bind(binder);
      const evaluate = (value) => runtime.evaluate(value, scope);
      const value = evaluate(node);
      setAnswer({ node, sample, placement, value, trace: runTrace(node, evaluate, value) });
    } finally {
      runtime.dispose();
    }
  }
  function set(key, value) {
    setSample((previous) => ({ ...previous, [key]: value }));
  }
  const state = current && stateOf(current.value);
  const output =
    state === 'passed'
      ? placement === 'visible'
        ? '显示「监护人信息」'
        : '断言通过'
      : state === 'failed'
        ? placement === 'visible'
          ? '隐藏「监护人信息」'
          : '断言失败 · 产生校验问题'
        : state === 'missing'
          ? '缺少输入，无法得出结果'
          : state === 'error'
            ? current.value.error
            : undefined;
  return (
    <section className="expr-side-panel expr-verification" aria-label="表达式验证">
      <header className="expr-side-heading">
        <h2>验证</h2>
        <button type="button" className="primary" onClick={run} disabled={!result.success}>
          验证条件
        </button>
      </header>
      {activeFields.length > 0 && (
        <div className="expr-sample">
          <h3>给定输入</h3>
          {activeFields.map(({ key, label, scope }) => (
            <label key={key}>
              <span>
                {label}
                <small>{scope ? '当前被保险人' : '表单根'}</small>
              </span>
              {key === 'plan' ? (
                <select
                  aria-label={label + (scope ? ' 当前被保险人' : ' 表单根')}
                  value={sample[key]}
                  onChange={(e) => set(key, e.target.value)}
                >
                  <option value="">缺失</option>
                  <option value="basic">基础方案</option>
                  <option value="plus">升级方案</option>
                </select>
              ) : (
                <input
                  aria-label={label + (scope ? ' 当前被保险人' : ' 表单根')}
                  type={key === 'age' ? 'number' : 'date'}
                  value={sample[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder="缺失"
                />
              )}
            </label>
          ))}
        </div>
      )}
      <div className="expr-verification-result" data-state={state} role="status">
        <span>执行结果</span>
        {state ? (
          <>
            <strong>{output}</strong>
            <span className={'expr-state ' + state}>{resultLabels[state]}</span>
          </>
        ) : (
          <p className="expr-muted">验证后显示最终结果。</p>
        )}
      </div>
      <section className="expr-condition-map" aria-label="条件流程">
        <h3>条件流程</h3>
        <ul className="expr-diagram">
          <ConditionDiagram node={node} trace={current?.trace} />
        </ul>
      </section>
    </section>
  );
}

function JsonDialog({ editor, close, placement }) {
  const dialog = useRef(null);
  const [source, setSource] = useState(() => json(editor.node));
  const [error, setError] = useState('');
  useEffect(() => {
    const el = dialog.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-label={editor.label + ' · 编辑 JSON'}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="expr-dialog-header">
        <h2>{editor.label} · 编辑 JSON</h2>
        <button className="quiet" onClick={close}>
          取消
        </button>
      </header>
      <textarea
        aria-label="表达式 JSON"
        value={source}
        rows={14}
        onChange={(e) => setSource(e.target.value)}
      />
      {error && (
        <p role="alert" className="expr-error">
          {error}
        </p>
      )}
      <footer>
        <button
          className="primary"
          onClick={() => {
            try {
              const next = JSON.parse(source);
              const result = check(editor.replace(next), placement);
              if (!result.success)
                throw Error(
                  result.diagnostics.find((item) => item.severity === 'error')?.message ??
                    '表达式无效。',
                );
              editor.commit(next);
              close();
            } catch (problem) {
              setError(problem.message);
            }
          }}
        >
          应用此段 JSON
        </button>
      </footer>
    </dialog>
  );
}

function App() {
  const [node, setNode] = useState(initial);
  const [placement, setPlacement] = useState('visible');
  const [editor, setEditor] = useState();
  const result = React.useMemo(() => check(node, placement), [node, placement]);
  function editJson(current, commit, label, path) {
    function replace(root, next, index = 0) {
      if (index === path.length) return next;
      return {
        ...root,
        args: root.args.map((child, childIndex) =>
          childIndex === path[index] ? replace(child, next, index + 1) : child,
        ),
      };
    }
    setEditor({ node: current, commit, label, replace: (next) => replace(node, next) });
  }
  return (
    <>
      <header className="expr-header">
        <div>
          <strong>家庭出行</strong>
          <span> / 配置 / 表达式</span>
        </div>
      </header>
      <main className="expr-workspace">
        <section className="expr-editor" aria-label="表达式编辑">
          <header className="expr-main-heading">
            <div>
              <h1>监护人信息</h1>
              <p>{placement === 'visible' ? '显示条件' : '校验断言'} · 当前被保险人</p>
            </div>
            <label>
              使用位置{' '}
              <select value={placement} onChange={(e) => setPlacement(e.target.value)}>
                <option value="visible">布局 · props.visible</option>
                <option value="assert">校验 · assert</option>
              </select>
            </label>
          </header>
          <ExpressionNode node={node} onChange={setNode} label="条件" onJson={editJson} />
          {!result.success && (
            <p className="expr-error" role="alert">
              {result.diagnostics.find((item) => item.severity === 'error')?.message ??
                '请检查表达式。'}
            </p>
          )}
        </section>
        <aside className="expr-side">
          <Verification result={result} node={node} placement={placement} />
          <details className="expr-side-panel expr-protocol">
            <summary>查看协议 JSON</summary>
            <p className="expr-muted">
              {placement === 'visible'
                ? 'ValueSpec · 外层自动使用 $expr'
                : 'Expression · 直接写入断言'}
            </p>
            <pre aria-label="协议 JSON">
              {json(placement === 'visible' ? { $expr: node } : node)}
            </pre>
          </details>
        </aside>
      </main>
      {editor && (
        <JsonDialog editor={editor} placement={placement} close={() => setEditor(undefined)} />
      )}
    </>
  );
}
createRoot(document.getElementById('expression-prototype')).render(<App />);
