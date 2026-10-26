import { expect, it } from 'vitest';
import { createRuntime } from '../src/index.js';
import { data, functions, prepared } from './fixtures.js';

it('patch 是浅更新、remove 删除对象属性、显式 insert 保留次数、锚点按稳定成员定位', async () => {
  const runtime = createRuntime({
    prepared: prepared(),
    data: { name: 'A', rows: [{ name: 'a' }, { name: 'b' }] },
    functions,
  });
  const [a, b] = runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' });
  const scope = { a: a!.row!, b: b!.row! };
  expect(
    runtime.dispatch({ op: 'patch', target: data(''), value: { flag: true, name: 'B' } }).ok,
  ).toBe(true);
  runtime.dispatch({ op: 'remove', target: data('/name') });
  expect(runtime.read(data('/name')).kind).toBe('missing');
  const command = {
    op: 'array.insert' as const,
    target: data('/rows'),
    position: { kind: 'before' as const, item: { $scope: 'b' } },
    value: { name: 'x' },
  };
  runtime.dispatch({ op: 'batch', commands: [command, command] }, scope);
  expect(runtime.read(data('/rows')).value).toEqual([
    { name: 'a' },
    { name: 'x' },
    { name: 'x' },
    { name: 'b' },
  ]);
  runtime.dispatch(
    {
      op: 'array.move',
      target: data('/rows'),
      item: { $scope: 'a' },
      position: { kind: 'after', item: { $scope: 'b' } },
    },
    scope,
  );
  expect(runtime.read(data('/rows')).value).toEqual([
    { name: 'x' },
    { name: 'x' },
    { name: 'b' },
    { name: 'a' },
  ]);
  const before = runtime.snapshot();
  expect(
    runtime.dispatch(
      {
        op: 'array.move',
        target: data('/rows'),
        item: { $scope: 'a' },
        position: { kind: 'index', index: 99 },
      },
      scope,
    ).ok,
  ).toBe(false);
  expect(runtime.snapshot()).toBe(before);
  runtime.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'b' } }, scope);
  expect(runtime.dispatch(command, scope).ok).toBe(false);
  await runtime.flush();
  runtime.dispose();
});
it('Schema 不做写入门禁，Missing ValueSpec 整条失败，batch 后续独立命令继续', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { age: 20 }, functions });
  const result = runtime.dispatch({
    op: 'batch',
    commands: [
      { op: 'set', target: data('/age'), value: '-' },
      { op: 'set', target: data('/name'), value: { $expr: { ref: data('/missing') } } },
      { op: 'set', target: data('/flag'), value: true },
    ],
  });
  expect(result).toMatchObject({ ok: false, changed: true });
  expect(runtime.snapshot()).toEqual({ age: '-', flag: true });
  expect((await runtime.validate()).status).toBe('invalid');
  runtime.dispose();
});
