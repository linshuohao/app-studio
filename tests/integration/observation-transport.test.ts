/* eslint-disable no-restricted-imports -- 未发布内部接缝的联合测试；不新增公共执行入口，正式跨包验收待同步切换后改用包导出。 */
import { afterEach, expect, it, vi } from 'vitest';
import { ObservationGateway } from '../../packages/runtime/src/devtools/observation-gateway.js';
import { createObservationClient } from '../../packages/devtools/src/client/observation-client.js';
import { observationPageRequest } from '../../packages/devtools/src/bridge/observation-request.js';
import type { ObservationReply } from '../../packages/runtime/src/devtools/observation-protocol.js';
afterEach(() => {
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
  vi.useRealTimers();
});
// 模拟扩展序列化到页面世界执行。跨包链路用真实 Gateway / Sessions，不用假成功响应替代。
const evaluate = new Function(
  'command',
  `return (${observationPageRequest.toString()})(command);`,
) as typeof observationPageRequest;
function fixture() {
  vi.useFakeTimers();
  const gateway = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 2,
      maxSnapshotBytes: 4096,
      maxEvents: 2,
      maxEventBytes: 4096,
      maxPageSize: 1,
    },
    {
      now: () => Date.now(),
      token: () => crypto.randomUUID(),
      schedule(callback, delay) {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
    },
    4,
  );
  const ref = { producerId: 'runtime', epoch: 'one' };
  const inspect = vi.fn(() => ({
    status: 'ok' as const,
    version: { dataRevision: 0, contextRevision: 0 },
    value: 'secret',
  }));
  const registration = gateway.register(
    {
      ref,
      snapshot: () => ({ revision: 0, rows: [{ id: 'reaction' }, { id: 'validation' }] }),
      revision: () => 0,
      inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
      inspect,
    },
    { kind: 'runtime', label: 'form', capabilities: ['metadata', 'values', 'events'] },
  );
  Object.defineProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__', {
    value: gateway.hook,
    configurable: true,
  });
  const request = vi.fn(async (command: Parameters<typeof evaluate>[0]) =>
    structuredClone(evaluate(structuredClone(command))),
  );
  const client = createObservationClient({ request }, () => crypto.randomUUID());
  return { gateway, ref, inspect, registration, client, request };
}
it('客户端→序列化桥接→多生产者路由→会话：分页与显式录制，丢回复后重试不吞事件', async () => {
  const f = fixture();
  expect((await f.client.query({ op: 'discover' })).result).toMatchObject({
    producers: [{ ref: f.ref }],
  });
  const opened = (await f.client.query({ op: 'openObservation', producer: f.ref })).result;
  if (opened.status !== 'ok' || !('sessionId' in opened)) throw Error('open');
  const target = { producer: f.ref, sessionId: opened.sessionId };
  const first = (
    await f.client.query({ op: 'readSnapshotPage', ...target, snapshotId: opened.snapshotId })
  ).result;
  if (first.status !== 'ok' || !('rows' in first)) throw Error('page');
  expect(first.rows).toEqual([{ id: 'reaction' }]);
  expect(
    (
      await f.client.query({
        op: 'readSnapshotPage',
        ...target,
        snapshotId: opened.snapshotId,
        cursor: first.nextCursor,
      })
    ).result,
  ).toMatchObject({ rows: [{ id: 'validation' }] });
  f.registration.publish('diagnostic', { i: 1 });
  const request = f.client.prepare({ op: 'readUpdates', ...target, cursor: opened.cursor });
  f.request.mockImplementationOnce(async (command) => {
    evaluate(command);
    throw Error('reply lost');
  });
  expect((await f.client.send(request)).result.status).toBe('unavailable');
  const retry = (await f.client.send(request)).result;
  expect(retry).toMatchObject({ events: [{ payload: { i: 1 } }], dropped: 0 });
  f.registration.publish('diagnostic', { i: 2 });
  expect((await f.client.send(request)).result).toEqual(retry);
  if (retry.status !== 'ok' || !('nextCursor' in retry) || !retry.nextCursor) throw Error('cursor');
  expect(
    (await f.client.query({ op: 'readUpdates', ...target, cursor: retry.nextCursor })).result,
  ).toMatchObject({ events: [{ payload: { i: 2 } }] });
  expect(f.inspect).not.toHaveBeenCalled();
  await f.client.query({ op: 'closeObservation', ...target });
  expect(vi.getTimerCount()).toBe(0);
  f.gateway.dispose();
});
it('旧 Hook 明确拒绝且不调用旧 read / subscribe；未发现不安装入口', async () => {
  const client = createObservationClient(
    { request: async (command) => evaluate(command) },
    () => 'request',
  );
  expect((await client.query({ op: 'discover' })).result.status).toBe('waiting');
  expect(Object.hasOwn(globalThis, '__FORM_ENGINE_DEVTOOLS__')).toBe(false);
  const read = vi.fn(),
    subscribe = vi.fn();
  Object.defineProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__', {
    value: { version: 1, read, subscribe },
    configurable: true,
  });
  expect((await client.query({ op: 'discover' })).result.status).toBe('incompatible');
  expect(read).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
});
it('乱序响应身份不匹配拒绝，传输异常只影响工具结果', async () => {
  const client = createObservationClient(
    { request: async () => ({ version: 2, requestId: 'other', result: { status: 'closed' } }) },
    () => 'mine',
  );
  expect((await client.query({ op: 'discover' })).result.status).toBe('unavailable');
  const incompatible = createObservationClient(
    { request: async () => ({ version: 1 }) as unknown as ObservationReply },
    () => 'mine',
  );
  expect((await incompatible.query({ op: 'discover' })).result.status).toBe('incompatible');
});

it('准备请求固定嵌套参数，外部修改和传输修改不改变原请求或重试', async () => {
  const producer = { producerId: 'a', epoch: 'one' };
  const seen: string[] = [];
  const client = createObservationClient(
    {
      request: async (request) => {
        if ('producer' in request) {
          seen.push(request.producer.producerId);
          (request.producer as { producerId: string }).producerId = 'transport-mutation';
        }
        return { version: 2, requestId: request.requestId, result: { status: 'unsupported' } };
      },
    },
    () => 'fixed',
  );
  const prepared = client.prepare({ op: 'openObservation', producer });
  producer.producerId = 'changed';
  await client.send(prepared);
  await client.send(prepared);
  expect(seen).toEqual(['a', 'a']);
  expect('producer' in prepared && prepared.producer.producerId).toBe('a');
});
it('未知状态与不匹配操作的成功响应拒绝，不能伪装成可信 DTO', async () => {
  for (const result of [
    { status: 'not-a-status' },
    { status: 'ok', events: [] },
    { status: 'closed' },
  ]) {
    const client = createObservationClient(
      {
        request: async (command) =>
          ({ version: 2, requestId: command.requestId, result }) as ObservationReply,
      },
      () => 'request',
    );
    expect((await client.query({ op: 'discover' })).result.status).toBe('unavailable');
  }
});
it('响应中的旧 epoch 事件不进入当前生产者流', async () => {
  const client = createObservationClient(
    {
      request: async (command) => ({
        version: 2,
        requestId: command.requestId,
        result: {
          status: 'ok',
          dropped: 0,
          nextCursor: 'next',
          events: [
            {
              ref: { producerId: 'runtime', epoch: 'old', sequence: 1 },
              kind: 'diagnostic',
              payload: {},
            },
          ],
        },
      }),
    },
    () => 'request',
  );
  expect(
    (
      await client.query({
        op: 'readUpdates',
        producer: { producerId: 'runtime', epoch: 'new' },
        sessionId: 'session',
        cursor: 'cursor',
      })
    ).result.status,
  ).toBe('unavailable');
});
it('取值响应不能把另一输入版本冒充当前请求，非 JSON 值不包装为元数据', async () => {
  for (const result of [
    { status: 'ok', version: { dataRevision: 2, contextRevision: 0 }, value: 'new input' },
    { status: 'ok', version: { dataRevision: 1, contextRevision: 0 }, value: new Date() },
  ]) {
    const client = createObservationClient(
      {
        request: async (command) =>
          ({ version: 2, requestId: command.requestId, result }) as ObservationReply,
      },
      () => 'request',
    );
    expect(
      (
        await client.query({
          op: 'inspectValue',
          producer: { producerId: 'runtime', epoch: 'one' },
          sessionId: 'session',
          expectedVersion: { dataRevision: 1, contextRevision: 0 },
          location: { path: '' },
        })
      ).result.status,
    ).toBe('unavailable');
  }
});
it('Reaction 事实经过序列化传输，客户端拒绝缺失字段及非法判别', async () => {
  const f = fixture();
  const open = (await f.client.query({ op: 'openObservation', producer: f.ref })).result;
  if (open.status !== 'ok' || !('sessionId' in open)) throw Error('open');
  const target = { producer: f.ref, sessionId: open.sessionId };
  const instance = { ...f.ref, entityId: 'reaction:1' };
  f.registration.publish('reaction.condition', {
    instance,
    executionId: 'execution:1',
    outcome: 'error',
    diagnostic: 'not-collected',
  });
  const result = (await f.client.query({ op: 'readUpdates', ...target, cursor: open.cursor }))
    .result;
  expect(result).toMatchObject({
    status: 'ok',
    events: [{ kind: 'reaction.condition', payload: { outcome: 'error' } }],
  });
  for (const [kind, payload] of [
    ['reaction.started', {}],
    ['reaction.condition', { instance, executionId: 'e', outcome: 'error' }],
    [
      'reaction.condition',
      { instance: { ...instance, epoch: 'other' }, executionId: 'e', outcome: 'true' },
    ],
    [
      'reaction.finished',
      { instance, executionId: 'e', outcome: 'success', actionCoverage: 'not-collected' },
    ],
  ] as const) {
    f.request.mockImplementationOnce(
      async (command) =>
        ({
          version: 2,
          requestId: command.requestId,
          result: {
            status: 'ok',
            dropped: 0,
            nextCursor: 'next',
            events: [{ ref: { ...f.ref, sequence: 99 }, kind, payload }],
          },
        }) as ObservationReply,
    );
    expect(
      (await f.client.query({ op: 'readUpdates', ...target, cursor: open.cursor })).result,
    ).toEqual({ status: 'unavailable' });
  }
  f.gateway.dispose();
});
it('操作、队列和动作事实通过传输校验；拒绝跨生产者原因和不可能的动作结果', async () => {
  const f = fixture();
  const opened = (await f.client.query({ op: 'openObservation', producer: f.ref })).result;
  if (opened.status !== 'ok' || !('sessionId' in opened)) throw Error('open');
  const target = { producer: f.ref, sessionId: opened.sessionId };
  let cursor = opened.cursor;
  const reference = { ...f.ref, sequence: 1 };
  const inputVersion = { dataRevision: 1, contextRevision: 0 };
  const instance = { ...f.ref, entityId: 'instance:1' };
  const command = {
    commandId: 'command:1',
    operation: reference,
    reactionExecutionId: null,
    actionIndex: null,
  };
  const valid = [
    ['operation.started', { source: 'dispatch', inputVersion }],
    [
      'operation.returned',
      { operation: reference, scope: 'entry-return', ok: true, changed: true, inputVersion },
    ],
    ['reaction.queued', { instance, queueEntryId: 'queue:1', cause: reference }],
    ['reaction.queue-merged', { instance, queueEntryId: 'queue:1', cause: null }],
    [
      'reaction.started',
      {
        instance,
        executionId: 'execution:1',
        queueEntryId: 'queue:1',
        inputVersion,
        causes: 'queue-events',
      },
    ],
    ['command.finished', { ...command, outcome: 'changed', diagnostic: 'not-collected' }],
    [
      'data.changed',
      {
        ...command,
        target: { path: '/a' },
        path: '/a',
        before: inputVersion,
        after: { dataRevision: 2, contextRevision: 0 },
        topologyChanged: false,
        detail: 'target-only',
      },
    ],
    [
      'action.finished',
      {
        reactionExecutionId: 'execution:1',
        actionIndex: 0,
        kind: 'command',
        outcome: 'changed',
        changed: true,
        scope: 'synchronous-return',
        diagnostic: 'not-collected',
      },
    ],
  ] as const;
  for (const [kind, payload] of valid) {
    f.registration.publish(kind, payload);
    const result = (await f.client.query({ op: 'readUpdates', ...target, cursor })).result;
    expect(result).toMatchObject({ status: 'ok', events: [{ kind, payload }] });
    if (result.status !== 'ok' || !('events' in result)) throw Error('read');
    cursor = result.nextCursor;
  }
  for (const [kind, payload] of [
    ['reaction.queued', { instance, queueEntryId: 'q', cause: { ...reference, epoch: 'other' } }],
    [
      'action.finished',
      {
        reactionExecutionId: 'e',
        actionIndex: 0,
        kind: 'host.emit',
        outcome: 'changed',
        scope: 'synchronous-return',
        diagnostic: 'not-collected',
      },
    ],
    [
      'action.finished',
      {
        reactionExecutionId: 'e',
        actionIndex: 0,
        kind: 'command',
        outcome: 'changed',
        changed: false,
        scope: 'synchronous-return',
        diagnostic: 'not-collected',
      },
    ],
    [
      'data.changed',
      {
        ...command,
        target: { path: 'invalid' },
        path: '/a',
        before: inputVersion,
        after: inputVersion,
        topologyChanged: false,
        detail: 'target-only',
      },
    ],
  ] as const) {
    f.request.mockImplementationOnce(
      async (request) =>
        ({
          version: 2,
          requestId: request.requestId,
          result: {
            status: 'ok',
            dropped: 0,
            nextCursor: 'next',
            events: [{ ref: reference, kind, payload }],
          },
        }) as ObservationReply,
    );
    expect((await f.client.query({ op: 'readUpdates', ...target, cursor })).result).toEqual({
      status: 'unavailable',
    });
  }
  f.gateway.dispose();
});
