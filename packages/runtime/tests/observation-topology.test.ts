import { expect, it } from 'vitest';
import { DataStore } from '../src/data/store.js';
import { describeTopology } from '../src/devtools/observation-topology.js';
const budget = { maxNodes: 10000, maxDepth: 64, maxTextBytes: 1000000 };
it('真实 DataStore 的跨对象/多成员结构有包含关系，不复制业务值', () => {
  const store = new DataStore({
    applicant: { name: 'secret applicant' },
    insured: Array.from({ length: 40 }, (_, i) => ({
      name: `secret ${i}`,
      age: 18,
      dependants: [{ name: 'secret child' }],
    })),
  });
  const graph = describeTopology(store.capture(), budget);
  const collection = graph.find((node) => node.path === '/insured')!;
  expect(collection.memberCount).toBe(40);
  const member = graph.find((node) => node.path === '/insured/0')!;
  expect(member.parentId).toBe(collection.id);
  const child = graph.find((node) => node.path === '/insured/0/dependants/0')!;
  expect(child.member).not.toBe(member.member);
  expect(JSON.stringify(graph)).not.toContain('secret');
  expect(graph.find((node) => node.path === '/insured/0/name')?.location).toEqual({
    member: member.member,
    path: '/name',
  });
});
it('移动及 set 既有成员对象保留成员与字段定位；整数组 set 重建身份', () => {
  const store = new DataStore({ rows: [{ name: 'a' }, { name: 'b' }] });
  const first = describeTopology(store.capture(), budget);
  const member = first.find((node) => node.path === '/rows/0')!;
  const field = first.find((node) => node.path === '/rows/0/name')!;
  store.array('/rows', { kind: 'move', from: 0, to: 1 });
  const moved = describeTopology(store.capture(), budget);
  expect(moved.find((node) => node.path === '/rows/1')?.id).toBe(member.id);
  expect(moved.find((node) => node.path === '/rows/1/name')?.id).toBe(field.id);
  store.write('/rows/1', { name: 'new', nested: [] });
  expect(
    describeTopology(store.capture(), budget).find((node) => node.path === '/rows/1')?.member,
  ).toBe(member.member);
  store.write('/rows', [{ name: 'a' }, { name: 'b' }]);
  expect(
    describeTopology(store.capture(), budget).some((node) => node.member === member.member),
  ).toBe(false);
  expect(first.find((node) => node.id === member.id)?.path).toBe('/rows/0');
});
it('嵌套父成员移动保持后代身份；删除再插入同业务数据不复用旧 ID', () => {
  const store = new DataStore({ rows: [{ children: [{ name: 'same' }] }, { children: [] }] });
  const before = describeTopology(store.capture(), budget);
  const child = before.find((node) => node.path === '/rows/0/children/0')!;
  store.array('/rows', { kind: 'move', from: 0, to: 1 });
  expect(describeTopology(store.capture(), budget).find((node) => node.id === child.id)?.path).toBe(
    '/rows/1/children/0',
  );
  store.array('/rows/1/children', { kind: 'remove', from: 0 });
  store.array('/rows/1/children', { kind: 'insert', to: 0, value: { name: 'same' } });
  expect(
    describeTopology(store.capture(), budget).find((node) => node.path === '/rows/1/children/0')
      ?.id,
  ).not.toBe(child.id);
});
it('根标量/根数组、空成员及转义属性有准确位置；预算不足不返回伪完整结构', () => {
  expect(describeTopology(new DataStore(null).capture(), budget)).toMatchObject([
    { kind: 'field', valueType: 'null', path: '' },
  ]);
  const store = new DataStore([{ 'a/b~c': { '': false } }, null, []]);
  const graph = describeTopology(store.capture(), budget);
  expect(graph.find((node) => node.path === '/0/a~1b~0c/')?.location.path).toBe('/a~1b~0c/');
  expect(graph.find((node) => node.path === '/1')?.member).toBeDefined();
  expect(graph.find((node) => node.path === '/2')?.memberCount).toBe(0);
  expect(() => describeTopology(store.capture(), { ...budget, maxNodes: 2 })).toThrow('budget');
  expect(() => describeTopology(store.capture(), { ...budget, maxDepth: 1 })).toThrow('budget');
  expect(() => describeTopology(store.capture(), { ...budget, maxTextBytes: 1 })).toThrow('budget');
});
