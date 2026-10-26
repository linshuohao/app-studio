import { describe, expect, it } from 'vitest';
import { DataStore } from '../src/data/store.js';
import { bindScopes, resolvePath } from '../src/scope/registry.js';

describe('初始化与 Command 的数据 / 身份事实', () => {
  it('接管输入、即时写入、旧快照稳定、未修改子树共享', () => {
    const input = { name: 'A', nested: { value: 1 } };
    const store = new DataStore(input);
    const before = store.capture();
    input.nested.value = 99;
    store.write('/name', 'B');
    expect(before.root).toEqual({ name: 'A', nested: { value: 1 } });
    expect(store.capture().root).toEqual({ name: 'B', nested: { value: 1 } });
    expect(store.read('/nested').value).toBe((before.root as typeof input).nested);
    expect(Object.isFrozen(store.capture().root)).toBe(true);
  });
  it('移动跟随成员；旧读取视图仍读旧位置；整数组 set 重建身份', () => {
    const store = new DataStore({ rows: [{ n: 'A', items: [1] }, { n: 'B' }] });
    const before = store.capture();
    const [a] = bindScopes(before, {
      from: { source: 'data', path: '/rows' },
      as: 'row',
      mode: 'each',
    });
    expect(a).toBeDefined();
    store.array('/rows', { kind: 'move', from: 0, to: 1 });
    expect(resolvePath(store.capture(), { source: 'data', path: '/n', scope: 'row' }, a!)).toBe(
      '/rows/1/n',
    );
    expect(resolvePath(before, { source: 'data', path: '/n', scope: 'row' }, a!)).toBe('/rows/0/n');
    store.write('/rows/1', { n: 'C', items: [2] });
    expect(resolvePath(store.capture(), { source: 'data', path: '/n', scope: 'row' }, a!)).toBe(
      '/rows/1/n',
    );
    store.write('/rows', [{ n: 'C' }, { n: 'B' }]);
    expect(() =>
      resolvePath(store.capture(), { source: 'data', path: '/n', scope: 'row' }, a!),
    ).toThrow('scope');
  });
  it('无效位置原子失败；缺失与 null 分开；业务非法值仍可写', () => {
    const store = new DataStore({ rows: [1], age: 20, nullable: null });
    const before = store.capture();
    expect(() => store.array('/rows', { kind: 'move', from: 0, to: 5 })).toThrow();
    expect(store.capture()).toBe(before);
    expect(store.read('/missing')).toEqual({ kind: 'missing' });
    expect(store.read('/nullable')).toEqual({ kind: 'value', value: null });
    store.write('/age', '-');
    expect(store.read('/age').value).toBe('-');
    expect(() => store.write('/missing/child', 1)).toThrow();
  });
  it.each([undefined, NaN, Infinity, Array(2), { value: undefined }, new Date()])(
    '拒绝非 JSON 输入 %s',
    (value) => {
      expect(() => new DataStore(value)).toThrow();
    },
  );
  it('业务属性 __proto__ / constructor / 空键遵循 JSON Pointer', () => {
    const store = new DataStore(JSON.parse('{"__proto__":{"x":1},"constructor":2,"":3,"a/b":4}'));
    store.write('/__proto__/x', 5);
    expect(store.read('/__proto__/x').value).toBe(5);
    expect(store.read('/').value).toBe(3);
    expect(store.read('/a~1b').value).toBe(4);
    expect(store.read('/toString')).toEqual({ kind: 'missing' });
  });
});
