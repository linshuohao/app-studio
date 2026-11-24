import { afterEach, expect, it, vi } from 'vitest';
import type { ReactionAction } from '@form-engine/protocol/definition';
import { createRuntime } from '../src/index.js';
import { ObservationGateway } from '../src/devtools/observation-gateway.js';
import { getObservedProducer } from '../src/devtools/observation-lifecycle.js';
import type { ObservationCommand } from '../src/devtools/observation-protocol.js';
import { data, functions, prepared } from './fixtures.js';
const budget = {
  definition: { maxRows: 5000, maxVisits: 100000, maxDepth: 64, maxTextBytes: 1000000 },
  topology: { maxNodes: 10000, maxDepth: 64, maxTextBytes: 1000000 },
  maxRows: 10000,
  maxBytes: 2000000,
};
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
});
async function fixture(
  maxEvents = 100,
  onAction?: () => void,
  selfRequeue = false,
  actions?: ReactionAction[],
) {
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers();
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'r',
          watch: [data('/age')],
          when: { ref: data('/flag') },
          then: actions ?? [
            { op: 'set', target: data('/total'), value: 9 },
            ...(onAction ? [{ type: 'host.emit' as const, event: 'action' }] : []),
            ...(selfRequeue ? [{ op: 'set' as const, target: data('/age'), value: 2 }] : []),
          ],
        },
      ],
    }),
    data: { age: 0, flag: true, total: 0 },
    functions,
    maxExecutions: 8,
    host: { events: { action: () => onAction?.() } },
  });
  await runtime.flush();
  const producer = getObservedProducer(runtime, budget)!;
  const now = vi.fn(() => Date.now());
  const gateway = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 4,
      maxSnapshotBytes: 2000000,
      maxEvents,
      maxEventBytes: 100000,
      maxPageSize: 1000,
    },
    {
      now,
      token: () => crypto.randomUUID(),
      schedule(callback, delay) {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
    },
    8,
  );
  gateway.register(producer, {
    kind: 'runtime',
    label: 'test',
    capabilities: ['metadata', 'events'],
  });
  const request = (command: ObservationCommand) =>
    gateway.hook.request({ ...command, version: 2, requestId: crypto.randomUUID() }).result;
  const open = () => {
    const result = request({ op: 'openObservation', producer: producer.ref });
    if (result.status !== 'ok' || !('sessionId' in result)) throw Error('open');
    const target = { producer: producer.ref, sessionId: result.sessionId };
    return { ...result, target };
  };
  const read = (session: ReturnType<typeof open>) => {
    const result = request({ op: 'readUpdates', ...session.target, cursor: session.cursor });
    if (result.status !== 'ok' || !('events' in result)) throw Error('read');
    return result;
  };
  return { runtime, producer, gateway, request, open, read, now };
}
it('真实 Reaction 经会话录制输出条件与终态，目录身份相同且读取重试不吞事件', async () => {
  const f = await fixture(),
    session = f.open();
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await f.runtime.flush();
  const events = f
    .read(session)
    .events.filter((e) =>
      ['reaction.started', 'reaction.condition', 'reaction.finished'].includes(e.kind),
    );
  expect(events.map((e) => e.kind)).toEqual([
    'reaction.started',
    'reaction.condition',
    'reaction.finished',
  ]);
  expect(
    f
      .read(session)
      .events.filter((e) =>
        ['reaction.started', 'reaction.condition', 'reaction.finished'].includes(e.kind),
      ),
  ).toEqual(events);
  expect(events[1]!.payload).toMatchObject({ outcome: 'true' });
  expect(events[2]!.payload).toMatchObject({
    outcome: 'completed',
    actionCoverage: 'all-declared',
  });
  const snapshot = f.producer.snapshot();
  if ('status' in snapshot) throw Error('snapshot');
  const instance = snapshot.rows.find(
    (row) =>
      typeof row === 'object' && row && 'record' in row && row.record === 'reaction-instance',
  );
  expect(events[0]!.payload).toMatchObject({
    instance: { ...f.producer.ref, entityId: (instance as { entityId: string }).entityId },
  });
  expect(f.runtime.snapshot()).toMatchObject({ total: 9 });
  f.runtime.dispose();
  f.gateway.dispose();
});
it('未录制不采集执行；各会话停止边界隔离，false 分支独立于未观测', async () => {
  const f = await fixture(),
    a = f.open(),
    b = f.open();
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await f.runtime.flush();
  expect(f.read(a).events.length).toBeGreaterThan(0);
  // 确认首批，再使用新游标。
  a.cursor = f.read(a).nextCursor;
  b.cursor = f.read(b).nextCursor;
  f.request({ op: 'closeObservation', ...a.target });
  f.runtime.dispatch({ op: 'set', target: data('/flag'), value: false });
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  await f.runtime.flush();
  expect(f.request({ op: 'readUpdates', ...a.target, cursor: a.cursor }).status).toBe(
    'session-expired',
  );
  const events = f
    .read(b)
    .events.filter((e) =>
      ['reaction.started', 'reaction.condition', 'reaction.finished'].includes(e.kind),
    );
  expect(events.map((e) => e.kind)).toEqual([
    'reaction.started',
    'reaction.condition',
    'reaction.finished',
  ]);
  expect(events[1]!.payload).toMatchObject({ outcome: 'false' });
  expect(events[2]!.payload).toMatchObject({ outcome: 'condition-false' });
  expect(f.read(b).events).toContainEqual(
    expect.objectContaining({
      kind: 'action.finished',
      payload: expect.objectContaining({ outcome: 'not-executed', reason: 'condition-false' }),
    }),
  );
  f.runtime.dispose();
  f.gateway.dispose();
});

it('when 技术错误单独记录，诊断缺失显式表示，不广播错误消息或输入', async () => {
  const f = await fixture(),
    session = f.open();
  f.runtime.dispatch({ op: 'set', target: data('/flag'), value: 'secret-input' });
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await f.runtime.flush();
  const events = f
    .read(session)
    .events.filter((e) =>
      ['reaction.started', 'reaction.condition', 'reaction.finished'].includes(e.kind),
    );
  expect(events[1]!.payload).toMatchObject({ outcome: 'error', diagnostic: 'not-collected' });
  expect(events[2]!.payload).toMatchObject({ outcome: 'condition-error' });
  expect(f.read(session).events).toContainEqual(
    expect.objectContaining({
      kind: 'action.finished',
      payload: expect.objectContaining({ outcome: 'not-executed', reason: 'condition-error' }),
    }),
  );
  expect(JSON.stringify(events)).not.toContain('secret-input');
  expect(f.runtime.snapshot()).toMatchObject({ total: 0 });
  f.runtime.dispose();
  f.gateway.dispose();
});
it('事件溢出报告 gap，不改变业务结果；各观察会话独立报告相同缺口', async () => {
  const f = await fixture(1),
    recording = f.open(),
    metadata = f.open();
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await f.runtime.flush();
  expect(f.read(recording)).toMatchObject({ dropped: 21, events: [{ kind: 'diagnostic' }] });
  expect(f.read(metadata)).toMatchObject({ dropped: 21, events: [{ kind: 'diagnostic' }] });
  expect(f.runtime.snapshot()).toMatchObject({ total: 9 });
  f.runtime.dispose();
  f.gateway.dispose();
});
it('同一事实跨两个 Gateway 身份一致，断开一个不影响另一个的序号与采集', async () => {
  const f = await fixture(),
    a = f.open();
  const second = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 2,
      maxSnapshotBytes: 2000000,
      maxEvents: 100,
      maxEventBytes: 100000,
      maxPageSize: 1000,
    },
    {
      now: () => Date.now(),
      token: () => crypto.randomUUID(),
      schedule(callback, delay) {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
    },
    8,
  );
  second.register(f.producer, {
    kind: 'runtime',
    label: 'second',
    capabilities: ['metadata', 'events'],
  });
  const request = (command: ObservationCommand) =>
    second.hook.request({ ...command, version: 2, requestId: crypto.randomUUID() }).result;
  const b = request({ op: 'openObservation', producer: f.producer.ref });
  if (b.status !== 'ok' || !('sessionId' in b)) throw Error('open');
  const target = { producer: f.producer.ref, sessionId: b.sessionId };
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await f.runtime.flush();
  const batch = request({ op: 'readUpdates', ...target, cursor: b.cursor });
  if (batch.status !== 'ok' || !('events' in batch)) throw Error('read');
  expect(batch.events).toEqual(f.read(a).events);
  f.gateway.dispose();
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  await f.runtime.flush();
  const next = request({ op: 'readUpdates', ...target, cursor: batch.nextCursor });
  if (next.status !== 'ok' || !('events' in next)) throw Error('read');
  expect(next.events[0]!.ref.sequence).toBeGreaterThan(batch.events.at(-1)!.ref.sequence);
  expect(next.events[0]!.payload).not.toEqual(batch.events[0]!.payload);
  f.runtime.dispose();
  second.dispose();
  expect(vi.getTimerCount()).toBe(0);
});

it('Host 动作中打开观察会话仍交付随后发生的终态，不补造窗口前开始事件', async () => {
  let start = () => {};
  const f = await fixture(100, () => start());
  let session: ReturnType<typeof f.open>;
  start = () => {
    session = f.open();
  };
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await f.runtime.flush();
  expect(
    f
      .read(session!)
      .events.filter((e) => e.kind === 'action.finished' || e.kind === 'reaction.finished')
      .map((e) => e.kind),
  ).toEqual(['action.finished', 'reaction.finished']);
  expect(
    f.read(session!).events.find((e) => e.kind === 'reaction.finished')!.payload,
  ).toMatchObject({
    outcome: 'completed',
    actionCoverage: 'all-declared',
  });
  f.runtime.dispose();
  f.gateway.dispose();
});
it('执行中再次失效产生不同执行编号，实例身份保持同一对象', async () => {
  const f = await fixture(100, undefined, true),
    session = f.open();
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  await f.runtime.flush();
  const starts = f.read(session).events.filter((e) => e.kind === 'reaction.started');
  expect(starts).toHaveLength(2);
  expect(starts[0]!.payload.instance).toEqual(starts[1]!.payload.instance);
  expect(starts[0]!.payload.executionId).not.toEqual(starts[1]!.payload.executionId);
  expect(f.runtime.snapshot()).toMatchObject({ age: 2, total: 9 });
  f.runtime.dispose();
  f.gateway.dispose();
});

it('两次操作的 Change 合并到同一队列项，执行只一次且两个因果引用均真实', async () => {
  const f = await fixture(),
    session = f.open();
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 2 });
  await f.runtime.flush();
  const events = f.read(session).events;
  const queues = events.filter(
    (e) => e.kind === 'reaction.queued' || e.kind === 'reaction.queue-merged',
  );
  const starts = events.filter((e) => e.kind === 'reaction.started');
  expect(queues.map((e) => e.kind)).toEqual(['reaction.queued', 'reaction.queue-merged']);
  expect(starts).toHaveLength(1);
  expect(queues.map((e) => e.payload.queueEntryId)).toEqual([
    starts[0]!.payload.queueEntryId,
    starts[0]!.payload.queueEntryId,
  ]);
  const changes = events.filter((e) => e.kind === 'data.changed');
  expect(queues.map((e) => e.payload.cause)).toEqual(changes.slice(0, 2).map((e) => e.ref));
  const operations = events.filter((e) => e.kind === 'operation.started');
  expect(changes.slice(0, 2).map((e) => e.payload.operation)).toEqual(operations.map((e) => e.ref));
  expect(changes[2]!.payload).toMatchObject({
    reactionExecutionId: starts[0]!.payload.executionId,
    actionIndex: 0,
    target: { path: '/total' },
    before: { dataRevision: 2 },
    after: { dataRevision: 3 },
  });
  expect(events.filter((e) => e.kind === 'action.finished').map((e) => e.payload.outcome)).toEqual([
    'changed',
  ]);
  expect(events.findIndex((e) => e.kind === 'operation.returned')).toBeLessThan(
    events.findIndex((e) => e.kind === 'reaction.started'),
  );
  f.runtime.dispose();
  f.gateway.dispose();
});
it('无变化没有 Change；batch 部分成功保留有效修改及独立失败，不复制输入', async () => {
  const f = await fixture(),
    session = f.open();
  const result = f.runtime.dispatch({
    op: 'batch',
    commands: [
      { op: 'set', target: data('/name'), value: 'secret-value' },
      { op: 'set', target: data('/name'), value: 'secret-value' },
      { op: 'set', target: data('/absent/child'), value: 1 },
    ],
  });
  const events = f.read(session).events;
  expect(result).toMatchObject({ ok: false, changed: true });
  expect(events.filter((e) => e.kind === 'data.changed')).toHaveLength(1);
  expect(events.filter((e) => e.kind === 'command.finished').map((e) => e.payload.outcome)).toEqual(
    ['changed', 'no-change', 'error'],
  );
  expect(events.at(-1)).toMatchObject({
    kind: 'operation.returned',
    payload: { ok: false, changed: true, scope: 'entry-return' },
  });
  expect(JSON.stringify(events)).not.toContain('secret-value');
  f.runtime.dispose();
  f.gateway.dispose();
});

it('非法 null 命令只报告原有一次错误，观测 finally 不制造第二次失败', async () => {
  const f = await fixture(),
    session = f.open();
  const result = f.runtime.dispatch(null as unknown as Parameters<typeof f.runtime.dispatch>[0]);
  expect(result.errors).toHaveLength(1);
  expect(f.read(session).events.filter((e) => e.kind === 'command.finished')).toMatchObject([
    { payload: { outcome: 'error' } },
  ]);
  f.runtime.dispose();
  f.gateway.dispose();
});

it('成员字段 Change 使用修改前稳定成员定位，不将位置索引当作成员身份', async () => {
  const f = await fixture(),
    session = f.open();
  f.runtime.dispatch({ op: 'set', target: data('/rows'), value: [{ name: 'a' }, { name: 'b' }] });
  const binding = f.runtime.bind({ as: 'row', from: data('/rows'), mode: 'each' })[0]!;
  f.runtime.dispatch(
    {
      op: 'array.move',
      target: data('/rows'),
      item: { $scope: 'row' },
      position: { kind: 'index', index: 1 },
    },
    binding,
  );
  f.runtime.dispatch({ op: 'set', target: data('/name', 'row'), value: 'new' }, binding);
  const changes = f.read(session).events.filter((e) => e.kind === 'data.changed');
  expect(changes.at(-1)!.payload).toMatchObject({
    target: { member: binding.row!.member, path: '/name' },
    path: '/rows/1/name',
  });
  f.runtime.dispose();
  f.gateway.dispose();
});

it('通知反馈熔断后的 batch 剩余叶命令标为未执行，动作保留已修改与中断事实', async () => {
  const f = await fixture(500, undefined, false, [
      {
        op: 'batch',
        commands: [
          { op: 'set', target: data('/total'), value: 9 },
          { op: 'set', target: data('/name'), value: 'must-not-write' },
        ],
      },
    ]),
    session = f.open();
  const observation = f.runtime.observe([data('/total')], () => {
    f.runtime.dispatch({
      op: 'set',
      target: data('/total'),
      value: (f.runtime.snapshot() as { total: number }).total + 1,
    });
  });
  f.runtime.dispatch({ op: 'set', target: data('/age'), value: 1 });
  expect((await f.runtime.flush()).status).toBe('aborted');
  const events = f.read(session).events;
  expect(events.filter((e) => e.kind === 'action.finished')).toMatchObject([
    { payload: { kind: 'command', outcome: 'interrupted', changed: true } },
  ]);
  expect(
    events.some((e) => e.kind === 'command.finished' && e.payload.outcome === 'not-executed'),
  ).toBe(true);
  expect(f.runtime.snapshot()).not.toHaveProperty('name');
  observation.dispose();
  f.runtime.dispose();
  f.gateway.dispose();
});
