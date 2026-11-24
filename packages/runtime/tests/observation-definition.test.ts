import { expect, it } from 'vitest';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import { describePrepared } from '../src/devtools/observation-definition.js';
import { data, prepared } from './fixtures.js';
const budget = { maxRows: 5000, maxVisits: 20000, maxDepth: 64, maxTextBytes: 200000 };
it('真实 Compiler Prepared 分开触发、潜在读取和写入，不把字面量识别成表达式', () => {
  const form = prepared({
    reactions: [
      {
        id: 'copy',
        watch: [data('/age')],
        when: { op: 'core.gt', args: [{ ref: data('/total') }, 0] },
        then: [{ op: 'set', target: data('/name'), value: { $expr: { ref: data('/name') } } }],
      },
    ],
  });
  const graph = describePrepared(form, 'prepared-1', budget);
  const rule = graph.nodes.find((node) => node.kind === 'reaction')!;
  const edges = graph.relations.filter((edge) => edge.subject === rule.id);
  expect(edges.filter((edge) => edge.kind === 'watches').map((edge) => edge.object)).toEqual([
    { kind: 'reference', reference: data('/age') },
  ]);
  expect(edges.filter((edge) => edge.kind === 'mayRead').map((edge) => edge.object)).toContainEqual(
    { kind: 'reference', reference: data('/total') },
  );
  expect(edges.filter((edge) => edge.kind === 'mayWrite').map((edge) => edge.object)).toEqual([
    { kind: 'reference', reference: data('/name') },
  ]);
  expect(graph.level).toBe('definition');
  expect(JSON.stringify(graph)).not.toContain('executionId');
});
it('校验有效 watch、requires 与 Issue 归属分别表达，根 Schema 不拆成运行任务', () => {
  const form = prepared({
    constraints: [
      {
        id: 'adult',
        kind: 'internal',
        assert: { op: 'core.gte', args: [{ ref: data('/age') }, 18] },
        issue: { target: data('/name'), code: 'adult' },
      },
      {
        id: 'later',
        kind: 'internal',
        requires: [{ kind: 'constraint', constraintId: 'adult' }],
        assert: true,
        issue: { target: data('/name'), code: 'later' },
      },
    ],
  });
  const graph = describePrepared(form, 'prepared-1', budget);
  const adult = graph.nodes.find((node) => node.ruleId === 'adult')!;
  expect(graph.relations).toContainEqual(
    expect.objectContaining({
      subject: adult.id,
      kind: 'invalidatedBy',
      provenance: 'compiler-derived',
      object: { kind: 'reference', reference: data('/age') },
    }),
  );
  expect(graph.relations).toContainEqual(
    expect.objectContaining({
      subject: adult.id,
      kind: 'reportsTo',
      object: { kind: 'reference', reference: data('/name') },
    }),
  );
  expect(graph.relations).toContainEqual(
    expect.objectContaining({ kind: 'requires', object: { kind: 'definition', id: adult.id } }),
  );
  expect(
    graph.nodes.some(
      (node) => node.pointer === '/definition/data/schema' && node.kind === 'schema',
    ),
  ).toBe(true);
  expect(graph.nodes.every((node) => !('workId' in node))).toBe(true);
});
it('Schema 递归引用保留边；条件分支未求值，不扫描 const 中的业务 $ref', () => {
  const form = structuredClone(prepared()) as PreparedForm;
  form.definition.data.schema = {
    $id: 'https://example.test/root',
    type: 'object',
    $defs: { item: { type: 'object', properties: { next: { $ref: '#/$defs/item' } } } },
    properties: {
      items: { type: 'array', items: { $ref: '#/$defs/item' } },
      constant: { const: { $ref: 'not-a-schema' } },
    },
    if: { required: ['items'] },
    then: { properties: { flag: { type: 'boolean' } } },
  };
  const graph = describePrepared(form, 'p', budget);
  expect(graph.relations.filter((edge) => edge.kind === 'schemaRef')).toHaveLength(2);
  expect(
    graph.relations
      .filter((edge) => edge.kind === 'schemaRef')
      .every((edge) => edge.resolution === 'resolved'),
  ).toBe(true);
  expect(graph.nodes.find((node) => node.pointer.endsWith('/then'))?.applicability).toBe(
    'not-evaluated',
  );
  expect(graph.nodes.some((node) => node.pointer.includes('/const/'))).toBe(false);
});
it('预算超限拒绝整个候选目录，输出不引用可变 Prepared 子对象', () => {
  const form = structuredClone(
    prepared({ reactions: [{ id: 'rule', watch: [data('/age')], then: [] }] }),
  ) as PreparedForm;
  expect(() => describePrepared(form, 'p', { ...budget, maxRows: 1 })).toThrow('budget');
  const graph = describePrepared(form, 'p', budget);
  form.definition.reactions![0]!.watch[0]!.source = 'data';
  (form.definition.reactions![0]!.watch[0] as { path: string }).path = '/changed';
  expect(graph.relations.find((edge) => edge.kind === 'watches')?.object).toEqual({
    kind: 'reference',
    reference: data('/age'),
  });
  expect(Object.isFrozen(graph.nodes)).toBe(true);
});
it('嵌套 $id、外部已加载资源与 anchor 解析，未知 / 动态引用明确保留', () => {
  const form = structuredClone(prepared()) as PreparedForm;
  form.definition.data.schema = {
    $id: 'https://example.test/root',
    properties: {
      local: {
        $id: 'sub',
        $defs: { item: { $anchor: 'target', type: 'string' } },
        allOf: [{ $ref: '#/$defs/item' }, { $ref: '#target' }],
      },
      external: { $ref: 'external#/$defs/value' },
      missing: { $ref: 'absent' },
      dynamic: { $dynamicRef: '#dynamic' },
    },
  };
  form.resources.schemas['https://example.test/external'] = {
    $defs: { value: { type: 'string' } },
  };
  const graph = describePrepared(form, 'p', budget);
  const references = graph.relations.filter((edge) => edge.kind === 'schemaRef');
  expect(references.filter((edge) => edge.resolution === 'resolved')).toHaveLength(3);
  expect(references.filter((edge) => edge.resolution === 'unresolved')).toHaveLength(2);
});
it('Schema 属性名含 ~ / 及 URI fragment 编码时仍定位同一个定义', () => {
  const form = structuredClone(prepared()) as PreparedForm;
  form.definition.data.schema = {
    properties: { 'a/b~c': { type: 'number' } },
    allOf: [{ $ref: '#/properties/a~1b~0c' }, { $ref: '#%2Fproperties%2Fa~1b~0c' }],
  };
  const graph = describePrepared(form, 'p', budget);
  const references = graph.relations.filter((edge) => edge.kind === 'schemaRef');
  expect(references.every((edge) => edge.resolution === 'resolved')).toBe(true);
  expect(references[0]!.object).toEqual(references[1]!.object);
});
it('字面量包装、普通业务对象中的保留字不制造潜在读取，batch 保留多次写入', () => {
  const form = structuredClone(prepared()) as PreparedForm;
  form.definition.reactions = [
    {
      id: 'r',
      runOnActivate: false,
      watch: [data('/age')],
      then: [
        {
          op: 'batch',
          commands: [
            {
              op: 'set',
              target: data('/name'),
              value: { $literal: { $expr: { ref: { ...data('/secret') } } } },
            },
            {
              op: 'set',
              target: data('/name'),
              value: { $expr: { literal: { ref: { ...data('/other') } } } },
            },
          ],
        },
      ],
    },
  ];
  const graph = describePrepared(form, 'p', budget);
  expect(graph.relations.filter((edge) => edge.kind === 'mayRead')).toEqual([]);
  expect(graph.relations.filter((edge) => edge.kind === 'mayWrite')).toHaveLength(2);
});
it('深层 AST、反复展开命名表达式和长字符串受预算约束', () => {
  const form = structuredClone(prepared()) as PreparedForm;
  form.definition.reactions = [
    { id: 'r', runOnActivate: false, watch: [data('/age')], when: { use: 'recursive' }, then: [] },
  ];
  form.definition.expressions = { recursive: { use: 'recursive' } };
  expect(describePrepared(form, 'p', budget).relations).toContainEqual(
    expect.objectContaining({
      object: { kind: 'unresolved', reference: 'recursive', reason: 'expression-cycle' },
    }),
  );
  expect(() => describePrepared(form, 'x'.repeat(1000), { ...budget, maxTextBytes: 50 })).toThrow(
    'budget',
  );
  expect(() => describePrepared(form, 'p', { ...budget, maxVisits: 1 })).toThrow('budget');
  expect(() => describePrepared(form, 'p', { ...budget, maxDepth: 1 })).toThrow('budget');
});

it('前置规则索引与 Schema URI 也受预算约束，不能先全量解析再报错', () => {
  const form = structuredClone(prepared()) as PreparedForm;
  form.definition.data.schema = {
    $id: 'https://example.test/' + 'x'.repeat(10000),
    type: 'object',
  };
  expect(() => describePrepared(form, 'p', { ...budget, maxTextBytes: 1000 })).toThrow('budget');
  let reads = 0;
  const rule = {
    kind: 'internal' as const,
    watch: [],
    assert: true,
    issue: { target: data('/age'), code: 'error' },
    get id() {
      reads++;
      return 'rule';
    },
  };
  form.definition.constraints = Array.from({ length: 10000 }, () => rule);
  expect(() => describePrepared(form, 'p', { ...budget, maxRows: 1 })).toThrow('budget');
  expect(reads).toBe(0);
  expect(() => describePrepared(form, 'p', { ...budget, maxRows: 20000, maxVisits: 1 })).toThrow(
    'budget',
  );
  expect(reads).toBeLessThanOrEqual(1);
});
it('field 同步前置保留 Compiler 推导的相关 Internal 关系', () => {
  const form = prepared({
    constraints: [
      {
        id: 'adult',
        kind: 'internal',
        assert: { op: 'core.gte', args: [{ ref: data('/age') }, 18] },
        issue: { target: data('/age'), code: 'adult' },
      },
      {
        id: 'next',
        kind: 'internal',
        requires: [{ kind: 'field', target: data('/age'), phase: 'sync' }],
        assert: true,
        issue: { target: data('/name'), code: 'next' },
      },
    ],
  });
  const graph = describePrepared(form, 'p', budget);
  const adult = graph.nodes.find((node) => node.ruleId === 'adult')!;
  const next = graph.nodes.find((node) => node.ruleId === 'next')!;
  expect(graph.relations).toContainEqual(
    expect.objectContaining({
      subject: next.id,
      kind: 'requires',
      provenance: 'compiler-derived',
      object: { kind: 'definition', id: adult.id },
    }),
  );
});
