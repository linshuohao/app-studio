import { expect, it, vi } from 'vitest';
import { DataStore } from '../src/data/store.js';
import { bindScopes, memberIndex, resolvePath } from '../src/scope/registry.js';
import { ScopeTable } from '../src/scope/table.js';
import { ScopeIndex } from '../src/scope/index.js';
import { createRuntime } from '../src/index.js';
import { ObserverRegistry } from '../src/observation/registry.js';
import { data, functions, prepared } from './fixtures.js';

const eachRow = { from: data('/rows'), as: 'row', mode: 'each' as const };

it('空 watch 成员订阅在删除时最后通知一次，随后解除 Context 观察', () => {
  const runtime = createRuntime({ prepared: prepared(), data: { rows: [{ age: 1 }, { age: 2 }] } });
  try {
    const [row] = runtime.bind(eachRow);
    let calls = 0;
    const observation = runtime.observe([], () => calls++, row);
    expect(observation.values).toEqual([]);
    runtime.replaceContext({ region: 'CN' });
    expect(calls).toBe(1);
    runtime.dispatch(
      {
        op: 'array.move',
        target: data('/rows'),
        item: { $scope: 'row' },
        position: { kind: 'index', index: 1 },
      },
      row,
    );
    expect(calls).toBe(1);
    runtime.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } }, row);
    expect(calls).toBe(2);
    runtime.replaceContext({ region: 'JP' });
    expect(calls).toBe(2);
    observation.dispose();
    observation.dispose();
  } finally {
    runtime.dispose();
  }
});

it('连续增删成员不积累空 watch 注册或退休项', () => {
  const store = new DataStore({ rows: [] });
  const registry = new ObserverRegistry(
    () => store.capture(),
    () => undefined,
    () => {},
    { maximum: 1000, consume: () => true, abort: () => {} },
    (callback) => callback(),
  );
  for (let i = 0; i < 30; i++) {
    let before = store.capture();
    store.array('/rows', { kind: 'insert', to: 0, value: { age: i } });
    registry.dataChanged('/rows', before);
    const [row] = bindScopes(store.capture(), eachRow);
    registry.add([], row!, () => {});
    before = store.capture();
    store.array('/rows', { kind: 'remove', from: 0 });
    registry.dataChanged('/rows', before);
  }
  expect((Reflect.get(registry, 'entries') as Map<unknown, unknown>).size).toBe(0);
  expect((Reflect.get(registry, 'retired') as Set<unknown>).size).toBe(0);
});

it('最后通知因反馈预算停止而丢弃时，失效成员订阅仍被释放', () => {
  const store = new DataStore({ rows: [{ age: 1 }] });
  const abort = vi.fn();
  const callback = vi.fn();
  const registry = new ObserverRegistry(
    () => store.capture(),
    () => undefined,
    () => {},
    { maximum: 1, consume: () => true, abort },
    (notify) => notify(),
  );
  const [row] = bindScopes(store.capture(), eachRow);
  registry.add([], row!, callback);
  registry.deferEffect(() => {
    const before = store.capture();
    store.array('/rows', { kind: 'remove', from: 0 });
    registry.dataChanged('/rows', before);
  });
  expect(abort).toHaveBeenCalledOnce();
  expect(callback).not.toHaveBeenCalled();
  expect((Reflect.get(registry, 'entries') as Map<unknown, unknown>).size).toBe(0);
  expect((Reflect.get(registry, 'retired') as Set<unknown>).size).toBe(0);
});

it('标量编辑及多属性patch复用Scope目录，不协调规则实例', async () => {
  const store = new DataStore({ rows: [{ age: 1, name: 'A', nested: [1] }] });
  const before = store.capture();
  store.write('/rows/0/age', 2);
  expect(store.capture().scopes).toBe(before.scopes);
  expect(store.capture().topologyChanged).toBe(false);
  store.patch('/rows/0', { age: 3, name: 'B' });
  expect(store.capture().scopes).toBe(before.scopes);
  expect(store.capture().topologyChanged).toBe(false);

  const runtime = createRuntime({
    prepared: prepared({
      reactions: [{ id: 'per-row', scope: eachRow, watch: [data('/age', 'row')], then: [] }],
    }),
    data: { rows: [{ age: 1 }] },
    functions,
  });
  await runtime.flush();
  const add = vi.spyOn(ObserverRegistry.prototype, 'add');
  const bind = vi.spyOn(before.scopes.constructor.prototype, 'membersOf');
  runtime.dispatch({ op: 'set', target: data('/rows/0/age'), value: 2 });
  await runtime.flush();
  expect(add).not.toHaveBeenCalled();
  expect(bind).not.toHaveBeenCalled();
  add.mockRestore();
  bind.mockRestore();
  runtime.dispose();
});

it('三层数组移动父项、插入和删除仍保留后代身份及旧视图', () => {
  const store = new DataStore({
    rows: [
      { age: 1, children: [{ name: 'X', tags: ['a', 'b'] }] },
      { age: 2, children: [] },
    ],
  });
  const old = store.capture();
  const [row] = bindScopes(old, eachRow);
  const [child] = bindScopes(
    old,
    { from: data('/children', 'row'), as: 'child', mode: 'each' },
    row,
  );
  const [tag] = bindScopes(old, { from: data('/tags', 'child'), as: 'tag', mode: 'each' }, child);
  const innerOrder = old.scopes.membersOf('/rows/0/children/0/tags');
  store.array('/rows', { kind: 'move', from: 0, to: 1 });
  expect(resolvePath(store.capture(), data('', 'tag'), tag)).toBe('/rows/1/children/0/tags/0');
  expect(resolvePath(old, data('', 'tag'), tag)).toBe('/rows/0/children/0/tags/0');
  expect(store.capture().scopes.membersOf('/rows/1/children/0/tags')).toBe(innerOrder);
  store.array('/rows/1/children/0/tags', { kind: 'insert', to: 0, value: 'new' });
  expect(memberIndex(store.capture(), '/rows/1/children/0/tags', 'tag', tag!)).toBe(1);
  store.array('/rows/1/children/0/tags', { kind: 'remove', from: 0 });
  expect(memberIndex(store.capture(), '/rows/1/children/0/tags', 'tag', tag!)).toBe(0);
  store.array('/rows', { kind: 'remove', from: 1 });
  expect(() => resolvePath(store.capture(), data('', 'tag'), tag)).toThrow('no longer alive');
  expect(resolvePath(old, data('', 'tag'), tag)).toBe('/rows/0/children/0/tags/0');
});

it('替换成员内容保留本项身份，替换数组销毁旧成员；patch只重建覆盖子树', () => {
  const store = new DataStore({ rows: [{ a: [1], b: [2] }], elsewhere: [3] });
  const old = store.capture(),
    row = old.scopes.membersOf('/rows')![0]!;
  const a = old.scopes.membersOf('/rows/0/a')!,
    b = old.scopes.membersOf('/rows/0/b')!,
    other = old.scopes.membersOf('/elsewhere');
  store.patch('/rows/0', { a: [4], value: 1 });
  expect(store.capture().scopes.memberPath(a[0]!)).toBeUndefined();
  expect(store.capture().scopes.membersOf('/rows/0/b')).toBe(b);
  expect(store.capture().scopes.membersOf('/elsewhere')).toBe(other);
  store.write('/rows/0', { b: [5] });
  expect(store.capture().scopes.membersOf('/rows')![0]).toBe(row);
  expect(store.capture().scopes.memberPath(b[0]!)).toBeUndefined();
  store.write('/rows', [{ b: [5] }]);
  expect(store.capture().scopes.memberPath(row)).toBeUndefined();
  expect(old.scopes.memberPath(row)).toBe('/rows/0');
});

it('不可变哈希目录保留碰撞键、旧版本，并清理删除后的叶节点', () => {
  const keys = ['costarring', 'liquid', ...Array.from({ length: 4000 }, (_, i) => `key-${i}`)];
  let table = new ScopeTable<number>();
  keys.forEach((key, i) => {
    table = table.set(key, i);
  });
  const old = table;
  expect(table.get('costarring')).toBe(0);
  expect(table.get('liquid')).toBe(1);
  keys.forEach((key, i) => {
    expect(table.get(key)).toBe(i);
    table = table.delete(key);
  });
  expect([...table.entries()]).toEqual([]);
  keys.forEach((key, i) => expect(old.get(key)).toBe(i));
});

it('尾插元数据更新量不随同层成员数增长，标量编辑和解除订阅不重建其他索引', async () => {
  const small = new DataStore({ rows: Array.from({ length: 10 }, () => 1) });
  const large = new DataStore({ rows: Array.from({ length: 2000 }, () => 1) });
  const set = vi.spyOn(ScopeTable.prototype, 'set');
  small.array('/rows', { kind: 'insert', to: 10, value: 1 });
  const count = set.mock.calls.length;
  set.mockClear();
  large.array('/rows', { kind: 'insert', to: 2000, value: 1 });
  expect(set.mock.calls.length).toBe(count);
  set.mockRestore();

  const runtime = createRuntime({
    prepared: prepared(),
    data: { rows: Array.from({ length: 50 }, () => ({ age: 1 })) },
    functions,
  });
  await runtime.flush();
  const subscriptions = runtime
    .bind(eachRow)
    .map((scope) => runtime.observe([data('/age', 'row')], () => {}, scope));
  const resolve = vi.spyOn(ScopeIndex.prototype, 'memberPath');
  runtime.dispatch({ op: 'set', target: data('/rows/0/age'), value: 2 });
  expect(resolve.mock.calls.length).toBeLessThan(10);
  resolve.mockClear();
  subscriptions[0]!.dispose();
  expect(resolve).not.toHaveBeenCalled();
  resolve.mockRestore();
  runtime.dispose();
});

it('连续结构命令与参考顺序一致，旧版本和转义集合路径保持可读', () => {
  const store = new DataStore({
    'a/b~': Array.from({ length: 8 }, (_, i) => ({ value: i, children: [i] })),
  });
  const path = '/a~1b~0';
  const original = store.capture(),
    initial = original.scopes.membersOf(path)!;
  const ids = [...initial];
  let seed = 42;
  const random = (max: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % max;
  };
  for (let step = 0; step < 160; step++) {
    const previous = store.capture(),
      oldOrder = previous.scopes.membersOf(path)!;
    const action = random(3);
    if (!ids.length || action === 0) {
      const to = random(ids.length + 1);
      store.array(path, { kind: 'insert', to, value: { value: step + 100, children: [step] } });
      ids.splice(to, 0, store.capture().scopes.membersOf(path)![to]!);
    } else if (action === 1) {
      const from = random(ids.length),
        removed = ids[from]!;
      store.array(path, { kind: 'remove', from });
      ids.splice(from, 1);
      expect(store.capture().scopes.memberPath(removed)).toBeUndefined();
    } else {
      const from = random(ids.length),
        to = random(ids.length);
      store.array(path, { kind: 'move', from, to });
      ids.splice(to, 0, ids.splice(from, 1)[0]!);
    }
    const current = store.capture();
    expect(current.scopes.membersOf(path)).toEqual(ids);
    ids.forEach((id, i) => {
      expect(current.scopes.memberPath(id)).toBe(`${path}/${i}`);
      expect(current.scopes.memberIndex(path, id)).toBe(i);
      const child = current.scopes.membersOf(`${path}/${i}/children`)![0]!;
      expect(current.scopes.memberPath(child)).toBe(`${path}/${i}/children/0`);
    });
    oldOrder.forEach((id, i) => expect(previous.scopes.memberPath(id)).toBe(`${path}/${i}`));
  }
  expect(original.scopes.membersOf(path)).toBe(initial);
  initial.forEach((id, i) => expect(original.scopes.memberPath(id)).toBe(`${path}/${i}`));
});

it('订阅随嵌套父项移动更新路径，失效成员即使只观察全局字段也会退休', async () => {
  const runtime = createRuntime({
    prepared: prepared(),
    data: { rows: [{ children: [{ name: 'A' }] }, { children: [] }], global: 0 },
    functions,
  });
  await runtime.flush();
  const [row] = runtime.bind(eachRow);
  const [child] = runtime.bind({ from: data('/children', 'row'), as: 'child', mode: 'each' }, row);
  let local = 0,
    global = 0;
  runtime.observe([data('/name', 'child')], () => local++, child);
  runtime.observe([data('/global')], () => global++, child);
  runtime.dispatch(
    {
      op: 'array.move',
      target: data('/rows'),
      item: { $scope: 'row' },
      position: { kind: 'index', index: 1 },
    },
    row,
  );
  expect(local).toBe(0);
  runtime.dispatch({ op: 'set', target: data('/rows/1/children/0/name'), value: 'B' });
  expect(local).toBe(1);
  runtime.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } }, row);
  expect(local).toBe(2);
  expect(global).toBe(1);
  runtime.dispatch({ op: 'set', target: data('/global'), value: 1 });
  expect(global).toBe(1);
  runtime.dispose();
});

it('标量存在性变化依然建立和移除非each绑定实例', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'exists',
          scope: { from: data('/name'), as: 'value', mode: 'one' },
          runOnActivate: true,
          watch: [data('/age')],
          then: [{ op: 'set', target: data('/total'), value: 1 }],
        },
      ],
    }),
    data: { age: 0 },
    functions,
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'present' });
  await runtime.flush();
  expect(runtime.snapshot()).toMatchObject({ total: 1 });
  runtime.dispatch({ op: 'remove', target: data('/name') });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data('/total'), value: 0 });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await runtime.flush();
  expect(runtime.snapshot()).toMatchObject({ total: 0 });
  runtime.dispose();
});

it('删除来源同步通知其外部校验贡献的替代Issue目标，无需等待flush', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          scope: eachRow,
          validator: 'check',
          target: data('/age', 'row'),
          watch: [data('/age', 'row')],
        },
      ],
    }),
    data: { rows: [{ age: 1 }], notice: '' },
    functions,
    host: {
      validators: {
        check: () => ({
          result: Promise.resolve([{ code: 'remote.notice', target: data('/notice') }]),
        }),
      },
    },
  });
  await runtime.flush();
  await Promise.resolve();
  await Promise.resolve();
  expect(runtime.getValidation(data('/notice')).issues).toHaveLength(1);
  let calls = 0;
  runtime.observe(
    [{ source: 'validation', field: data('/notice'), observe: 'issues' }],
    () => calls++,
  );
  const [row] = runtime.bind(eachRow);
  runtime.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } }, row);
  expect(runtime.getValidation(data('/notice')).issues).toEqual([]);
  expect(calls).toBe(1);
  runtime.dispose();
});
