import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Input } from '../../apps/studio/src/components/ui/controls';
import { StudioSelect } from '../../apps/studio/src/components/ui/select';
import { Icon } from '../../apps/studio/src/components/ui/icon';
import { FieldPicker } from '../../apps/studio/src/components/field-picker';
import { createCoreFunctions } from '@form-engine/pure-functions';
import * as business from '../../packages/pure-functions/src/manifests';
import { agePolicy } from '../../apps/playground/src/demos/travel/policy';

const entries = [
  ...Object.values(createCoreFunctions({})).map((x) => x.manifest),
  ...Object.values(business),
];
const catalog = Object.fromEntries(entries.map((m) => [m.id, m]));
const titles = {
  and: '全部成立',
  or: '任一成立',
  not: '取反',
  lt: '小于',
  lte: '小于等于',
  gt: '大于',
  gte: '大于等于',
  eq: '等于',
  ne: '不等于',
  exists: '存在',
  requiresGuardian: '是否需要监护人',
  inclusiveDays: '日期天数',
  ageInYears: '周岁',
  isNonBlank: '文本非空',
  isEligibleAge: '年龄符合要求',
  isTripRangeAllowed: '行程符合要求',
  personPremium: '被保人保费',
  totalPremium: '总保费',
};
const title = (id) => titles[id.split('.').pop()] || id;
const group = (id) =>
  /^core\.(and|or|not)$/.test(id)
    ? '逻辑组合'
    : /^core\.(eq|ne|lt|lte|gt|gte|exists)$/.test(id)
      ? '比较与判断'
      : id.startsWith('travel.')
        ? '投保业务'
        : /^(date|text)\./.test(id)
          ? '日期与文本'
          : '其他';
const age = { source: 'data', scope: 'insured', path: '/age' },
  plan = { source: 'data', path: '/plan' };
const fields = [
  { ref: age, label: '当前被保人 › 年龄', type: 'integer' },
  { ref: plan, label: '出行方案', type: 'string' },
];
const compare = () => ({ op: 'core.lt', args: [{ ref: age }, 18] });
const planRule = () => ({ op: 'core.eq', args: [{ ref: plan }, 'plus'] });
const logical = (id) => ['core.and', 'core.or'].includes(id);
function start(id) {
  if (id === 'core.eq') return planRule();
  if (logical(id)) return { op: id, args: [compare(), planRule()] };
  if (id === 'travel.requiresGuardian')
    return { op: id, args: [{ ref: age }, { literal: agePolicy }] };
  return {
    op: id,
    args: catalog[id].parameters
      .filter((p) => !p.optional)
      .map((p) => (p.schema?.type === 'string' ? '' : p.schema?.type === 'boolean' ? true : 0)),
  };
}
function Pick({ label, value, options, change }) {
  return (
    <StudioSelect aria-label={label} value={value} onValueChange={change}>
      {options.map(([id, text]) => (
        <option key={id} value={id}>
          {text}
        </option>
      ))}
    </StudioSelect>
  );
}
function Help({ text }) {
  return (
    <span className="help">
      <button aria-label={text}>i</button>
      <span role="tooltip">{text}</span>
    </span>
  );
}
function Editor({ node, change, mode, expected, label }) {
  const [choosing, setChoosing] = useState(false),
    [query, search] = useState('');
  const fn = catalog[node?.op],
    options = entries.filter(
      (m) =>
        (!expected || expected === 'any' || !m.returns.type || m.returns.type === expected) &&
        (title(m.id) + m.id).toLowerCase().includes(query.toLowerCase()),
    );
  const replace = (i, v) => change({ ...node, args: node.args.map((a, j) => (i === j ? v : a)) });
  const choose = (id) => {
    change(start(id));
    setChoosing(false);
    search('');
  };
  const directory = (
    <div className="directory">
      <Input
        aria-label="搜索函数"
        placeholder="搜索函数名称或 ID"
        value={query}
        onChange={(e) => search(e.target.value)}
      />
      {['逻辑组合', '比较与判断', '日期与文本', '投保业务', '其他'].map(
        (g) =>
          options.some((m) => group(m.id) === g) && (
            <div key={g}>
              <small>{g}</small>
              {options
                .filter((m) => group(m.id) === g)
                .map((m) => (
                  <Button variant="text" key={m.id} onClick={() => choose(m.id)}>
                    {title(m.id)}
                  </Button>
                ))}
            </div>
          ),
      )}
      {!options.length && <small>没有匹配的函数</small>}
      <Button variant="secondary" onClick={() => setChoosing(false)}>
        收起目录
      </Button>
    </div>
  );
  if (!fn && node?.pending)
    return (
      <div>
        {choosing ? (
          directory
        ) : (
          <Button variant="secondary" onClick={() => setChoosing(true)}>
            选择函数…
          </Button>
        )}
      </div>
    );
  if (!fn) {
    const source = node?.ref ? '字段' : node?.use ? '具名表达式' : '固定值';
    return (
      <div className="expr-row">
        <Pick
          label="参数来源"
          value={source}
          options={['字段', '固定值', '具名表达式', '函数结果'].map((s) => [s, s])}
          change={(s) =>
            change(
              s === '字段'
                ? { ref: age }
                : s === '函数结果'
                  ? { pending: true }
                  : s === '具名表达式'
                    ? { use: 'tripDays' }
                    : '',
            )
          }
        />
        {node?.ref ? (
          <FieldPicker
            label="选择字段"
            fields={fields}
            value={node.ref}
            onChange={(ref) => change({ ref })}
          />
        ) : node?.use ? (
          <span>行程天数</span>
        ) : node?.literal ? (
          <details>
            <summary>年龄规则</summary>
            <pre>{JSON.stringify(node.literal, null, 2)}</pre>
          </details>
        ) : node === 'plus' || node === 'basic' ? (
          <Pick
            label="方案"
            value={node}
            options={[
              ['plus', '增强方案'],
              ['basic', '基础方案'],
            ]}
            change={change}
          />
        ) : (
          <Input
            aria-label="固定值"
            value={String(node ?? '')}
            onChange={(e) => {
              const v = e.target.value;
              change(v.trim() && Number.isFinite(Number(v)) ? Number(v) : v);
            }}
          />
        )}
      </div>
    );
  }
  const args = node.args;
  const compact = mode === 'B' && group(fn.id) === '比较与判断' && args.length === 2;
  const arg = (value, i) => (
    <Editor
      label={'参数 ' + (i + 1)}
      mode={mode}
      node={value}
      change={(v) => replace(i, v)}
      expected={(fn.parameters[i] || fn.restParameter)?.schema?.type}
    />
  );
  const selector = (
    <Button
      className="fn-choice"
      aria-expanded={choosing}
      variant="secondary"
      onClick={() => setChoosing(!choosing)}
    >
      {title(fn.id)}
      <Icon name="ChevronDown" />
    </Button>
  );
  return (
    <div className="node">
      {compact ? (
        <div className="compact">
          {arg(args[0], 0)}
          {selector}
          {arg(args[1], 1)}
        </div>
      ) : (
        <div className="expr-row">
          <strong>{mode === 'A' ? '函数' : logical(fn.id) ? '满足' : '条件'}</strong>
          {selector}
          <Help
            text={
              logical(fn.id)
                ? '子条件分别计算布尔值，再按所选逻辑组合。'
                : '参数按所选函数的签名顺序传入。'
            }
          />
          <small>{fn.returns.type === 'boolean' ? '布尔值' : fn.returns.type}</small>
        </div>
      )}
      {choosing && directory}
      {!compact &&
        args.map((v, i) => (
          <div className="argument" key={i}>
            <small>
              {logical(fn.id)
                ? '条件 ' + (i + 1)
                : group(fn.id) === '比较与判断'
                  ? i
                    ? '右值'
                    : '左值'
                  : fn.parameters[i]?.name || '参数'}
            </small>
            {arg(v, i)}
          </div>
        ))}
      {logical(fn.id) &&
        (mode === 'A' ? (
          <Button
            variant="secondary"
            onClick={() => change({ ...node, args: [...args, { pending: true }] })}
          >
            添加条件
          </Button>
        ) : (
          <Pick
            label="添加条件"
            value=""
            options={[
              ['', '添加条件…'],
              ['cmp', '字段比较'],
              ['group', '条件组'],
              ['fn', '选择函数…'],
            ]}
            change={(k) =>
              k &&
              change({
                ...node,
                args: [
                  ...args,
                  k === 'cmp' ? planRule() : k === 'group' ? start('core.or') : { pending: true },
                ],
              })
            }
          />
        ))}
    </div>
  );
}
function Panel({ mode }) {
  const initial = () => ({ op: 'core.and', args: [compare()] });
  const [node, set] = useState(initial);
  return (
    <section className="studio-form-layout" data-density="regular">
      <header>
        <small>草案 {mode}</small>
        <h2>{mode === 'A' ? '从函数开始' : '从条件开始'}</h2>
        <p>{mode === 'A' ? '选函数，按签名逐项填写入参。' : '按字段、比较方式和值组织条件。'}</p>
      </header>
      <Editor mode={mode} node={node} change={set} expected="boolean" />
      <footer>
        <details>
          <summary>查看表达式草稿</summary>
          <pre>{JSON.stringify(node, null, 2)}</pre>
        </details>
        <Button variant="text" onClick={() => set(initial())}>
          重置
        </Button>
      </footer>
    </section>
  );
}
createRoot(document.querySelector('#comparison')).render(
  <>
    <Panel mode="A" />
    <Panel mode="B" />
  </>,
);
