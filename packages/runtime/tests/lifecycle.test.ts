import { expect, it } from 'vitest';
import { createRuntime } from '../src/index.js';
import { data, functions, prepared } from './fixtures.js';

it('显式 null Context 在初始化与替换时保留，读取其属性返回 Missing', () => {
  const runtime = createRuntime({ prepared: prepared(), data: {}, context: null });
  try {
    expect(runtime.read({ source: 'context', path: '' })).toEqual({ kind: 'value', value: null });
    expect(runtime.read({ source: 'context', path: '/region' })).toEqual({ kind: 'missing' });
    runtime.replaceContext({ region: 'CN' });
    expect(runtime.read({ source: 'context', path: '/region' })).toEqual({
      kind: 'value',
      value: 'CN',
    });
    runtime.replaceContext(null);
    expect(runtime.read({ source: 'context', path: '' })).toEqual({ kind: 'value', value: null });
    expect(runtime.read({ source: 'context', path: '/region' })).toEqual({ kind: 'missing' });
  } finally {
    runtime.dispose();
  }
});

it('未提供 Context 时仍默认使用空对象', () => {
  const runtime = createRuntime({ prepared: prepared(), data: {} });
  try {
    expect(runtime.read({ source: 'context', path: '' })).toEqual({ kind: 'value', value: {} });
    expect(runtime.read({ source: 'context', path: '/region' })).toEqual({ kind: 'missing' });
  } finally {
    runtime.dispose();
  }
});

it('拒绝原始 Definition、旧 ABI、缺少或不匹配的锁定函数，不按别名猜实现', () => {
  const form = prepared({
    reactions: [
      {
        id: 'r',
        watch: [data('/age')],
        then: [
          { op: 'set', target: data('/total'), value: { $expr: { op: 'core.add', args: [1, 2] } } },
        ],
      },
    ],
  });
  expect(() =>
    createRuntime({
      prepared: { ...form, preparedFormatVersion: 'form-engine.prepared/1' },
      data: {},
    }),
  ).toThrow('format');
  expect(() => createRuntime({ prepared: form, data: {} })).toThrow('function');
  const changed = {
    ...functions,
    'core.add': {
      ...functions['core.add']!,
      artifact: { ...functions['core.add']!.artifact, id: 'different' },
    },
  };
  expect(() => createRuntime({ prepared: form, data: {}, functions: changed })).toThrow('function');
  expect(() => createRuntime({ prepared: form.definition as never, data: {} })).toThrow('Prepared');
});
it('未锁定的额外函数不能通过公开求值入口绕过绑定，订阅先注册再交付初读', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { age: 1 }, functions });
  expect(runtime.evaluate({ op: 'core.add', args: [1, 2] }).kind).toBe('error');
  let notifications = 0;
  const observation = runtime.observe([data('/age')], () => {
    notifications++;
  });
  expect(observation.values).toEqual([{ kind: 'value', value: 1 }]);
  runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  expect(notifications).toBe(1);
  await runtime.flush();
  runtime.dispose();
  expect(runtime.read(data('/age')).kind).toBe('error');
  expect(runtime.dispatch({ op: 'set', target: data('/age'), value: 3 }).ok).toBe(false);
  expect((await runtime.flush()).status).toBe('disposed');
});
it('Trace 容量独立于执行预算，关闭 Trace 不改变结果；订阅异常隔离', async () => {
  for (const traceCapacity of [0, 2]) {
    const runtime = createRuntime({
      prepared: prepared(),
      data: { age: 1 },
      functions,
      traceCapacity,
    });
    let calls = 0;
    runtime.observe([data('/age')], () => {
      throw Error('subscriber');
    });
    runtime.observe([data('/age')], () => {
      calls++;
    });
    runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
    expect(calls).toBe(1);
    expect(runtime.snapshot()).toEqual({ age: 2 });
    expect((await runtime.flush()).status).toBe('settled');
    expect(runtime.diagnostics().length).toBeLessThanOrEqual(traceCapacity);
    runtime.dispose();
  }
});
it('真实替换实例拥有不同证明身份，旧成员订阅在删除时通知并释放', async () => {
  const first = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'age',
          kind: 'internal',
          scope: { from: data('/rows'), as: 'row', mode: 'each' },
          assert: true,
          issue: { target: data('/age', 'row'), code: 'age' },
        },
      ],
    }),
    data: { rows: [{ age: 1 }] },
    functions,
  });
  const second = createRuntime({ prepared: prepared(), data: { rows: [{ age: 1 }] }, functions });
  const one = await first.validate(),
    two = await second.validate();
  expect(one.input).not.toEqual(two.input);
  const [row] = first.bind({ from: data('/rows'), as: 'row', mode: 'each' });
  const reads: unknown[] = [];
  first.observe(
    [data('/age', 'row')],
    () => {
      reads.push(first.read(data('/age', 'row'), row).kind);
    },
    row,
  );
  first.dispatch({ op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } }, row);
  expect(reads).toEqual(['error']);
  first.dispatch({
    op: 'array.insert',
    target: data('/rows'),
    position: { kind: 'index', index: 0 },
    value: { age: 2 },
  });
  expect(reads).toEqual(['error']);
  first.dispose();
  second.dispose();
});

it('公共方法可解构为回调，并保持各实例的状态与销毁隔离', async () => {
  const form = prepared();
  const first = createRuntime({ prepared: form, data: { age: 1 }, context: { region: 'JP' } });
  const second = createRuntime({ prepared: form, data: { age: 9 }, context: { region: 'CN' } });
  const { read, snapshot, dispatch, replaceContext, flush, validate, dispose } = first;
  expect(Object.isFrozen(first)).toBe(true);
  dispatch({ op: 'set', target: data('/age'), value: 2 });
  replaceContext({ region: 'SG' });
  expect(snapshot()).toEqual({ age: 2 });
  expect(read({ source: 'context', path: '/region' }).value).toBe('SG');
  await flush();
  expect((await validate()).status).toBe('valid');
  dispose();
  dispose();
  expect(read(data('/age')).kind).toBe('error');
  expect(second.snapshot()).toEqual({ age: 9 });
  expect(second.read({ source: 'context', path: '/region' }).value).toBe('CN');
  second.dispose();
});
