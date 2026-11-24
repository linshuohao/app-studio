import { afterEach, expect, it, vi } from 'vitest';
import { createRuntime } from '../src/index.js';
import {
  getDevtoolsHook,
  registerObservedProducer,
  emitObservedEvent,
} from '../src/devtools/index.js';
import type {
  ObservationCommand,
  ObservationProducer,
  ProducerRef,
} from '../src/devtools/observation-protocol.js';
import { data, prepared } from './fixtures.js';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
});
const browser = () => {
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers();
};
const request = (command: ObservationCommand) =>
  getDevtoolsHook()!.request({ ...command, version: 2, requestId: crypto.randomUUID() }).result;
const list = () => {
  const r = request({ op: 'discover' });
  if (r.status !== 'ok' || !('producers' in r)) throw Error('discover');
  return r.producers;
};
const open = (producer: ProducerRef) => {
  const r = request({ op: 'openObservation', producer });
  if (r.status !== 'ok' || !('sessionId' in r)) throw Error('open');
  return r;
};
const factory = (ref: ProducerRef): ObservationProducer => ({
  ref,
  snapshot: () => ({ revision: 0, rows: [{ record: 'test' }] }),
  revision: () => 0,
  inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
  inspect: () => ({ status: 'unsupported' }),
});
it('开发态发现仅提供新版请求；元数据不隐式复制值，显式检查校验输入版本', async () => {
  browser();
  const runtime = createRuntime({ prepared: prepared(), data: { name: 'A' } });
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'B' });
  await runtime.flush();
  const producer = list()[0]!.ref,
    session = open(producer),
    target = { producer, sessionId: session.sessionId };
  expect(getDevtoolsHook()).toMatchObject({ version: 2 });
  expect('read' in getDevtoolsHook()!).toBe(false);
  expect('subscribe' in getDevtoolsHook()!).toBe(true);
  const page = request({ op: 'readSnapshotPage', ...target, snapshotId: session.snapshotId });
  expect(JSON.stringify(page)).not.toContain('"B"');
  const inspected = request({
    op: 'inspectValue',
    ...target,
    expectedVersion: { dataRevision: 1, contextRevision: 0 },
    location: { path: '/name' },
  });
  expect(inspected).toMatchObject({ status: 'ok', value: 'B' });
  runtime.dispose();
  expect(list()).toEqual([]);
  expect(vi.getTimerCount()).toBe(0);
});
it('会话自动接收，关闭会话不再交付；读取事件不清空，原游标可重试', () => {
  browser();
  const owner = {},
    stop = registerObservedProducer(owner, factory);
  const producer = list()[0]!.ref,
    session = open(producer),
    target = { producer, sessionId: session.sessionId };
  emitObservedEvent(owner, 'diagnostic', () => ({ code: 'before' }));
  emitObservedEvent(owner, 'diagnostic', () => ({ code: 'after' }));
  const command = { op: 'readUpdates' as const, ...target, cursor: session.cursor };
  const result = request(command);
  expect(result).toMatchObject({
    status: 'ok',
    events: [{ payload: { code: 'before' } }, { payload: { code: 'after' } }],
  });
  expect(request(command)).toEqual(result);
  request({ op: 'closeObservation', ...target });
  expect(request(command)).toEqual({ status: 'session-expired' });
  stop();
});
it('公开会话有界且容量丢失不静默，租约自动释放', () => {
  browser();
  const owner = {},
    stop = registerObservedProducer(owner, factory);
  const producer = list()[0]!.ref,
    session = open(producer),
    target = { producer, sessionId: session.sessionId };
  for (let i = 0; i < 10100; i++) emitObservedEvent(owner, 'diagnostic', () => ({ i }));
  const result = request({ op: 'readUpdates', ...target, cursor: session.cursor });
  expect(result).toMatchObject({ status: 'ok', dropped: 100 });
  if (result.status === 'ok' && 'events' in result) expect(result.events).toHaveLength(10000);
  vi.advanceTimersByTime(30001);
  expect(request({ op: 'readUpdates', ...target, cursor: session.cursor })).toEqual({
    status: 'session-expired',
  });
  stop();
});
it('无浏览器或旧标记不会启用新版发现，更不会执行旧接口', () => {
  const runtime = createRuntime({ prepared: prepared(), data: {} });
  expect(getDevtoolsHook()).toBeUndefined();
  runtime.dispose();
  browser();
  const read = vi.fn(),
    subscribe = vi.fn();
  vi.stubGlobal('__FORM_ENGINE_DEVTOOLS__', { version: 1, read, subscribe });
  const another = createRuntime({ prepared: prepared(), data: {} });
  expect(getDevtoolsHook()).toBeUndefined();
  expect(read).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
  another.dispose();
});
it('多份引擎共享目录和父级释放，不提供旧协议回退', async () => {
  browser();
  const owner = {},
    stop = registerObservedProducer(owner, factory);
  vi.resetModules();
  const second = await import('../src/devtools/index.js');
  const child = second.registerObservedProducer({}, factory, owner, {
    kind: 'view',
    label: 'child',
    capabilities: ['metadata'],
  });
  expect(list().map((p) => p.kind)).toEqual(['runtime', 'view']);
  stop();
  expect(list()).toEqual([]);
  child();
});
it('过大元数据及键按预算拒绝，不返回伪完整快照', () => {
  browser();
  const stop = registerObservedProducer({}, (ref) => ({
    ...factory(ref),
    snapshot: () => ({ revision: 0, rows: [{ ['x'.repeat(8000001)]: 1 }] }),
  }));
  const producer = list()[0]!.ref;
  expect(request({ op: 'openObservation', producer })).toEqual({ status: 'budget-exceeded' });
  stop();
});

it('现场定位只返回原诊断引用及当前可用性，截断不冒充完整现场', async () => {
  browser();
  const onDiagnostic = vi.fn();
  const runtime = createRuntime({
    prepared: prepared(),
    data: { name: 'private-input' },
    traceCapacity: 4,
    onDiagnostic,
  });
  await runtime.flush();
  const producer = list()[0]!.ref,
    session = open(producer),
    target = { producer, sessionId: session.sessionId };
  runtime.dispatch({ op: 'set', target: data('/missing/child'), value: 'private-value' });
  const updates = request({ op: 'readUpdates', ...target, cursor: session.cursor });
  if (updates.status !== 'ok' || !('events' in updates)) throw Error('events');
  const error = updates.events.find(
    (event) =>
      event.kind === 'diagnostic' && JSON.stringify(event.payload).includes('command.error'),
  )!;
  expect(error).toBeDefined();
  const location = request({ op: 'locateEvidence', ...target, event: error.ref });
  expect(location).toMatchObject({
    status: 'ok',
    availability: 'available',
    reason: 'retained-runtime-diagnostic',
  });
  expect(JSON.stringify(location)).not.toContain('private-input');
  await Promise.resolve();
  expect(
    onDiagnostic.mock.calls.some(([report]) => JSON.stringify(report).includes('private-input')),
  ).toBe(true);
  for (let index = 0; index < 10; index++)
    runtime.dispatch({ op: 'set', target: data('/name'), value: String(index) });
  await runtime.flush();
  expect(request({ op: 'locateEvidence', ...target, event: error.ref })).toMatchObject({
    status: 'ok',
    availability: 'unavailable',
    reason: 'not-recorded-or-expired',
    diagnosticSequences: [],
  });
  expect(
    request({ op: 'locateEvidence', ...target, event: { ...error.ref, epoch: 'other' } }),
  ).toMatchObject({ status: 'invalid-reference' });
  runtime.dispose();
});
