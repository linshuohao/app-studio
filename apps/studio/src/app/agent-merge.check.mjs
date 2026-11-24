import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts'))
        return next(specifier + '.ts', context);
      throw error;
    }
  },
});
const { compareAgentDraft } = await import('./agent-merge-model.ts');
const compare = (...values) => compareAgentDraft(...values.map((v) => JSON.stringify(v)));
test('旅险标题与联动自动合并，同一提示文字须显式选取', () => {
  const base = { label: '目的地城市', hint: '输入城市名称', clear: false };
  const current = { ...base, label: '抵达城市', hint: '请输入抵达城市' };
  const candidate = { ...base, hint: '搜索目的地城市', clear: true };
  const plan = compare(base, current, candidate);
  assert.deepEqual(
    plan.rows.map(({ path, status }) => [path, status]),
    [
      ['/label', 'current'],
      ['/hint', 'conflict'],
      ['/clear', 'candidate'],
    ],
  );
  assert.throws(() => plan.apply(new Map()), /冲突/);
  assert.deepEqual(JSON.parse(plan.apply(new Map([['/hint', 'current']]))), {
    ...current,
    clear: true,
  });
  assert.deepEqual(JSON.parse(plan.apply(new Map([['/hint', 'candidate']]))), {
    ...candidate,
    label: '抵达城市',
  });
});
test('区分字段缺失和 null，删除与候选修改冲突，转义路径可安全选择', () => {
  const plan = compare({ 'a/b~': null }, {}, { 'a/b~': 1 });
  assert.deepEqual(plan.rows[0], {
    path: '/a~1b~0',
    base: 'null',
    current: undefined,
    candidate: '1',
    status: 'conflict',
  });
  assert.equal(plan.apply(new Map([['/a~1b~0', 'current']])), '{}');
});
test('对齐可识别的物料数组，在各自绑定的字段内合并', () => {
  const field = (name) => ({
    material: 'field',
    slots: {
      default: [{ material: 'text-input', bindings: { value: name }, props: { x: 0, y: 0 } }],
    },
  });
  const base = [field('country'), field('city')],
    current = structuredClone(base),
    candidate = structuredClone(base);
  current[1].slots.default[0].props.x = 1;
  candidate[1].slots.default[0].props.y = 2;
  const plan = compare(base, current, candidate);
  assert.deepEqual(
    plan.rows.map(({ path }) => path),
    ['/1/slots/default/0/props/x', '/1/slots/default/0/props/y'],
  );
  assert.deepEqual(JSON.parse(plan.apply(new Map()))[1].slots.default[0].props, { x: 1, y: 2 });
});
test('数组重排、增删和重复元素身份均作为整体冲突', () => {
  for (const [base, current, candidate] of [
    [
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }, { id: 'a' }],
      [{ id: 'a', x: 1 }, { id: 'b' }],
    ],
    [[{ id: 'a' }], [{ id: 'a' }, { id: 'b' }], [{ id: 'a', x: 1 }]],
    [
      [{ material: 'text' }, { material: 'text' }],
      [{ material: 'text', x: 1 }, { material: 'text' }],
      [{ material: 'text' }, { material: 'text', y: 1 }],
    ],
  ])
    assert.deepEqual(
      compare(base, current, candidate).rows.map(({ path, status }) => [path, status]),
      [['', 'conflict']],
    );
});
test('只采用一版时原文逐字节保留，混合结果保留数字和字符串原始 Token', () => {
  const raw = '{ "n": 9007199254740993, "s": "\\u0041", "x": 0 }\n';
  const agent = '{"added":true,"n":9007199254740993,"s":"\\u0041","x":0}\n';
  assert.equal(compareAgentDraft(raw, raw, agent).apply(new Map()), agent);
  assert.equal(compareAgentDraft(raw, raw, raw.trim()).apply(new Map()), raw);
  const plan = compareAgentDraft(raw, raw.replace('"x": 0', '"x": -0'), agent);
  assert.equal(plan.apply(new Map()), '{"added":true,"n":9007199254740993,"s":"\\u0041","x":-0}');
  assert.throws(() => compareAgentDraft('{}', '{"x":0,"x":1}', '{}'), /重复/);
});
