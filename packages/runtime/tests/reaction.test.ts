import { expect, it } from 'vitest';
import { createRuntime } from '../src/index.js';
import { data, functions, prepared } from './fixtures.js';
import { FlushContext } from '../src/reactions/context.js';

it('普通通知扇出不消耗反馈深度预算，不因订阅者数量熔断', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { age: 0 }, maxExecutions: 2 });
  await runtime.flush();
  let calls = 0;
  for (let i = 0; i < 5; i++) runtime.observe([data('/age')], () => calls++);
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  expect(calls).toBe(5);
  expect((await runtime.flush()).status).toBe('settled');
  runtime.dispose();
});

it('同步通知持续写回在本轮停止，后续动作不执行，新交互仍可建立新轮次', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'start',
          watch: [data('/flag')],
          then: [
            { op: 'set', target: data('/age'), value: 1 },
            { op: 'set', target: data('/total'), value: 99 },
          ],
        },
      ],
    }),
    functions,
    data: { flag: false, age: 0, total: 0 },
    maxExecutions: 3,
  });
  await runtime.flush();
  let calls = 0;
  const observation = runtime.observe([data('/age')], () => {
    if (++calls < 40) runtime.dispatch({ op: 'set', target: data('/age'), value: calls + 1 });
  });
  runtime.dispatch({ op: 'set', target: data('/flag'), value: true });
  expect((await runtime.flush()).status).toBe('aborted');
  expect(calls).toBe(3);
  expect(runtime.snapshot()).toMatchObject({ total: 0 });
  observation.dispose();
  runtime.dispatch({ op: 'set', target: data('/flag'), value: false });
  expect((await runtime.flush()).status).toBe('settled');
  expect(runtime.snapshot()).toMatchObject({ total: 99 });
  runtime.dispose();
});

it('尚未开始Flush的同步观察写回也能结束，不改变普通通知的同步交付', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { age: 0 }, maxExecutions: 3 });
  await runtime.flush();
  let calls = 0;
  runtime.observe([data('/age')], () => {
    if (++calls < 40) runtime.dispatch({ op: 'set', target: data('/age'), value: calls + 1 });
  });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  expect(calls).toBe(3);
  await runtime.flush();
  runtime.dispose();
});

it('同一规则实例的独立预算能在本轮总预算之前停止重复执行', () => {
  const context = new FlushContext(1, 5, 0, { entries: [], truncated: false }, 2);
  expect(context.consumeReaction('A')).toBe(true);
  expect(context.consumeReaction('B')).toBe(true);
  expect(context.consumeReaction('A')).toBe(true);
  expect(context.consumeReaction('A')).toBe(false);
  expect(context.outcome(false)).toMatchObject({ status: 'aborted', executions: 3 });
});

it('编辑即时写入，25→26→25仍入队一次，执行读取最新值，then 单条失败继续', async () => {
  const calls: unknown[] = [];
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'quote',
          watch: [data('/age')],
          then: [
            { op: 'set', target: data('/absent/child'), value: 1 },
            {
              op: 'set',
              target: data('/total'),
              value: { $expr: { op: 'core.mul', args: [{ ref: data('/age') }, 10] } },
            },
            { type: 'host.emit', event: 'quoted', payload: { $expr: { ref: data('/total') } } },
            { type: 'host.emit', event: 'quoted', payload: 42 },
          ],
        },
      ],
    }),
    data: { age: 25, total: 0 },
    functions,
    host: {
      events: {
        quoted: (input) => {
          calls.push(input.payload);
        },
      },
    },
  });
  runtime.dispatch({
    op: 'batch',
    commands: [26, 25].map((age) => ({ op: 'set', target: data('/age'), value: age })),
  });
  expect(runtime.read(data('/total'))).toEqual({ kind: 'value', value: 0 });
  const result = await runtime.flush();
  expect(result.status).toBe('settled');
  expect(result.executions).toBe(1);
  expect(runtime.read(data('/total'))).toEqual({ kind: 'value', value: 250 });
  expect(calls).toEqual([250, 42]);
  expect(runtime.diagnostics().some((d) => d.kind === 'command.error')).toBe(true);
  runtime.dispose();
});
it('只 watch age 的既有实例不会因导入同 age 或 Context 替换主动重算', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'r',
          watch: [data('/age')],
          runOnActivate: true,
          then: [{ op: 'set', target: data('/total'), value: 100 }],
        },
      ],
    }),
    data: { age: 25, total: 0 },
    functions,
  });
  await runtime.flush();
  runtime.dispatch({ op: 'set', target: data(''), value: { age: 25, total: 80 } });
  runtime.replaceContext({ region: 'SG' });
  await runtime.flush();
  expect(runtime.snapshot()).toEqual({ age: 25, total: 80 });
  runtime.dispose();
});
it('同步订阅写回留在同轮；循环停止清空队列，下一次有效交互建立新预算', async () => {
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'loop',
          watch: [data('/age')],
          then: [
            {
              op: 'set',
              target: data('/age'),
              value: { $expr: { op: 'core.add', args: [{ ref: data('/age') }, 1] } },
            },
          ],
        },
      ],
    }),
    data: { age: 0 },
    functions,
    maxExecutions: 3,
  });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  expect(await runtime.flush()).toMatchObject({ status: 'aborted', executions: 3 });
  expect(runtime.read(data('/age')).value).toBe(4);
  runtime.dispatch({ op: 'set', target: data('/age'), value: 10 });
  expect(await runtime.flush()).toMatchObject({ status: 'aborted', executions: 3 });
  expect(runtime.read(data('/age')).value).toBe(13);
  runtime.dispose();
});
it('相对订阅跟随成员移动，绝对订阅沿位置，释放后不再通知', async () => {
  const runtime = createRuntime({
    prepared: prepared(),
    data: { rows: [{ age: 1 }, { age: 2 }] },
    functions,
  });
  const [row] = runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' });
  const relative: unknown[] = [],
    absolute: unknown[] = [];
  const subscription = runtime.observe(
    [data('/age', 'row')],
    () => {
      relative.push(runtime.read(data('/age', 'row'), row).value);
    },
    row,
  );
  runtime.observe([data('/rows/0/age')], () => {
    absolute.push(runtime.read(data('/rows/0/age')).value);
  });
  runtime.dispatch(
    {
      op: 'array.move',
      target: data('/rows'),
      item: { $scope: 'row' },
      position: { kind: 'index', index: 1 },
    },
    row,
  );
  expect(relative).toEqual([]);
  expect(absolute).toEqual([2]);
  runtime.dispatch({ op: 'set', target: data('/age', 'row'), value: 3 }, row);
  expect(relative).toEqual([3]);
  subscription.dispose();
  runtime.dispatch({ op: 'set', target: data('/age', 'row'), value: 4 }, row);
  expect(relative).toEqual([3]);
  await runtime.flush();
  runtime.dispose();
});
it('通知回调重入不能吞掉同一条 Command 已发生的其他观察失效', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { age: 25 }, functions });
  let notifications = 0;
  runtime.observe([data('/age')], () => {
    if (runtime.read(data('/age')).value === 26)
      runtime.dispatch({ op: 'set', target: data('/age'), value: 25 });
  });
  runtime.observe([data('/age')], () => {
    notifications++;
  });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 26 });
  expect(notifications).toBe(2);
  await runtime.flush();
  runtime.dispose();
});

it.each([false, true])(
  '新增 / 整数组替换的成员只按 runOnActivate=%s 激活',
  async (runOnActivate) => {
    let calls = 0;
    const runtime = createRuntime({
      prepared: prepared({
        reactions: [
          {
            id: 'new-row',
            scope: { from: data('/rows'), as: 'row', mode: 'each' },
            watch: [data('/age', 'row')],
            runOnActivate,
            then: [{ type: 'host.emit', event: 'called' }],
          },
        ],
      }),
      data: { rows: [] },
      functions,
      host: {
        events: {
          called: () => {
            calls++;
          },
        },
      },
    });
    await runtime.flush();
    runtime.dispatch({
      op: 'array.insert',
      target: data('/rows'),
      position: { kind: 'index', index: 0 },
      value: { age: 10 },
    });
    await runtime.flush();
    expect(calls).toBe(runOnActivate ? 1 : 0);
    runtime.dispatch({ op: 'set', target: data('/rows'), value: [{ age: 20 }] });
    await runtime.flush();
    expect(calls).toBe(runOnActivate ? 2 : 0);
    runtime.dispatch({ op: 'set', target: data('/rows/0/age'), value: 21 });
    await runtime.flush();
    expect(calls).toBe(runOnActivate ? 3 : 1);
    runtime.dispose();
  },
);

it('校验状态回调重入之前，同条 Command 的 Data 观察失效已经登记', async () => {
  const runtime = createRuntime({ prepared: prepared(), data: { age: 25 }, functions });
  await runtime.flush();
  let changed = false,
    notifications = 0;
  runtime.observe([{ source: 'validation', field: data('/age'), observe: 'status' }], () => {
    if (!changed && runtime.getValidation(data('/age')).status === 'unverified') {
      changed = true;
      runtime.dispatch({ op: 'set', target: data('/age'), value: 25 });
    }
  });
  runtime.observe([data('/age')], () => {
    notifications++;
  });
  runtime.dispatch({ op: 'set', target: data('/age'), value: 26 });
  expect(notifications).toBe(2);
  await runtime.flush();
  runtime.dispose();
});
