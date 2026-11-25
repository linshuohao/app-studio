import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@form-engine/studio-design-components';
import { StudioSelect } from '@form-engine/studio-design-components/select';
import { travelDefinition } from '../../../../apps/playground/src/demos/travel/definition';
import { goldenData } from '../../../../apps/playground/src/demos/travel/policy';
import { artifact, definitions } from '../../../../apps/playground/src/demos/catalog';
import * as pure from '@form-engine/pure-functions';
import { compile } from '@form-engine/compiler';
import { createRuntime } from '@form-engine/runtime';

import { ExpressionEditor } from '../../../../apps/studio/src/app/expression-editor';
import { reactionFields } from '../../../../apps/studio/src/app/reaction-fields';
import functionDocs from '../../../pure-functions/catalog-docs.json';

const rule = travelDefinition.constraints.find((c) => c.id === 'guardian-required');
const sample = goldenData();
const registry = { ...pure.createCoreFunctions(artifact) };
for (const factory of [
  pure.createTextIsNonBlank,
  pure.createDateInclusiveDays,
  pure.createTravelIsEligibleAge,
  pure.createTravelRequiresGuardian,
  pure.createTravelIsTripRangeAllowed,
  pure.createTravelPersonPremium,
  pure.createTravelTotalPremium,
]) {
  const binding = factory(artifact);
  registry[binding.manifest.id] = binding;
}
const catalog = {
  id: 'travel-acceptance',
  materials: Object.fromEntries(
    definitions.map(({ contract: { manifest } }) => [manifest.id, { manifest, artifact }]),
  ),
  pureFunctions: Object.fromEntries(
    Object.entries(registry).map(([id, { manifest }]) => [id, { manifest, artifact }]),
  ),
};
const labels = {
  start: '开始日期',
  end: '结束日期',
  days: '行程天数',
  maxDays: '最长行程天数',
  ratePolicy: '费率规则',
  value: '待检查的值',
  age: '年龄',
  guardianName: '监护人姓名',
  person: '当前被保人',
  insureds: '被保人',
  name: '姓名',
  plan: '出行方案',
  travel: '行程',
  startDate: '出发日期',
  endDate: '返程日期',
  applicant: '投保人',
  phone: '电话',
  idNumber: '证件号码',
  acknowledged: '已确认',
  estimatedTotalMinor: '预计总保费',
  countryCode: '国家',
  city: '城市',
  agePolicy: '年龄规则',
};
const fieldLabel = (ref) =>
  [
    ref.scope && labels[ref.scope],
    ...ref.path
      .split('/')
      .filter(Boolean)
      .map((k) => labels[k] || k),
  ]
    .filter(Boolean)
    .join(' › ') || '表单';
function Select({ label, value, onChange, items }) {
  return (
    <StudioSelect aria-label={label} value={value} onValueChange={onChange}>
      {items.map(([key, text]) => (
        <option key={key} value={key}>
          {text}
        </option>
      ))}
    </StudioSelect>
  );
}
const displayContext = {
  fields: reactionFields(travelDefinition.data.schema, [rule.scope]).map((field) => ({
    ...field,
    title: field.title || fieldLabel(field.ref),
  })),
  manifests: Object.values(registry).map((binding) => binding.manifest),
  named: travelDefinition.expressions,
};
const displayDocs = new Map(Object.entries(functionDocs));
function evaluate(expression, index) {
  const definition = {
    protocolVersion: travelDefinition.protocolVersion,
    id: travelDefinition.id,
    version: travelDefinition.version,
    data: travelDefinition.data,
    expressions: travelDefinition.expressions,
    constraints: [{ ...rule, when: expression }],
    views: { desktop: { material: 'section', slots: { default: [] } } },
  };
  const built = compile({ definition, catalog, target: { profile: 'desktop' } });
  if (!built.success)
    throw Error(built.diagnostics.find((d) => d.severity === 'error')?.message || '编译失败');
  const runtime = createRuntime({
    prepared: built.prepared,
    data: structuredClone(sample),
    functions: registry,
  });
  try {
    return runtime.evaluate(expression, runtime.bind(rule.scope)[index]);
  } finally {
    runtime.dispose();
  }
}
function Page() {
  const [node, edit] = useState(rule.when),
    [index, select] = useState('1'),
    [result, report] = useState(''),
    [revision, reset] = useState(0);
  const set = (v) => {
    edit(v);
    report('');
  };
  function run() {
    try {
      const r = evaluate(node, Number(index));
      report(
        r.kind === 'value'
          ? r.value
            ? '条件成立，校验监护人姓名。'
            : '条件未成立，跳过这条校验。'
          : JSON.stringify(r),
      );
    } catch (e) {
      report(e.message);
    }
  }
  return (
    <>
      <section className="studio-form-layout">
        <header>
          <h2>校验生效条件</h2>
          <p>对每位被保人分别判断，返回布尔值。</p>
        </header>
        <ExpressionEditor
          key={revision}
          label="生效条件"
          raw={JSON.stringify(node)}
          onChange={(raw) => set(JSON.parse(raw))}
          {...displayContext}
          functionDocs={displayDocs}
          allowValidation={false}
          expected={{ type: 'boolean' }}
        />
        <footer>
          <details>
            <summary>查看表达式 JSON</summary>
            <pre>{JSON.stringify(node, null, 2)}</pre>
          </details>
          <Button
            variant="text"
            onClick={() => {
              set(rule.when);
              reset(revision + 1);
            }}
          >
            恢复原配置
          </Button>
        </footer>
      </section>
      <section className="studio-form-layout">
        <header>
          <h2>样例试算</h2>
          <p>使用家庭旅行投保验收样例中的被保人。</p>
        </header>
        <div className="stack">
          <Select
            label="试算被保人"
            value={index}
            onChange={(v) => {
              select(v);
              report('');
            }}
            items={sample.insureds.map((p, i) => [String(i), p.name + ' · ' + p.age + ' 岁'])}
          />
          <div>
            <Button onClick={run}>试算条件</Button>
          </div>
          {result && (
            <output className="result" aria-live="polite">
              {result}
            </output>
          )}
          <details>
            <summary>查看样例成员数据</summary>
            <pre>{JSON.stringify(sample.insureds[index], null, 2)}</pre>
          </details>
        </div>
      </section>
    </>
  );
}
createRoot(document.querySelector('#comparison')).render(<Page />);
