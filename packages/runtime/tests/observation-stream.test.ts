import { afterEach, expect, it, vi } from 'vitest';
import { ObservationGateway } from '../src/devtools/observation-gateway.js';
import type {
  ObservationEventSink,
  ObservationPush,
} from '../src/devtools/observation-protocol.js';
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const gateway = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 4,
      maxSnapshotBytes: 4096,
      maxEvents: 2,
      maxEventBytes: 4096,
      maxPageSize: 10,
    },
    {
      now: () => Date.now(),
      token: () => crypto.randomUUID(),
      schedule(callback, delay) {
        const id = setTimeout(callback, delay);
        return () => clearTimeout(id);
      },
    },
    10,
  );
  let sink: ObservationEventSink | undefined,
    sequence = 0;
  const ref = { producerId: 'runtime', epoch: 'one' };
  const snapshot = vi.fn(() => ({ revision: 0, rows: [] }));
  const registration = gateway.register(
    {
      ref,
      snapshot,
      revision: () => 0,
      inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
      inspect: () => ({ status: 'unsupported' }),
      connectEvents(value) {
        sink = value;
        return () => {
          sink = undefined;
        };
      },
    },
    { kind: 'runtime', label: 'test', capabilities: ['metadata', 'events'] },
  );
  const emit = (payload: () => { code: number }) => {
    if (sink?.interested('diagnostic'))
      sink.append('diagnostic', payload, { ...ref, sequence: ++sequence });
  };
  return { gateway, snapshot, registration, emit };
}
it('没有工具不构造事实，订阅无需查询/选中即异步接收，闲置超过快照租期仍存活', () => {
  const f = fixture(),
    payload = vi.fn(() => ({ code: 1 })),
    pushes: ObservationPush[] = [];
  f.emit(payload);
  expect(payload).not.toHaveBeenCalled();
  const stop = f.gateway.hook.subscribe((push) => pushes.push(push));
  f.emit(payload);
  expect(pushes).toEqual([]);
  vi.advanceTimersByTime(1);
  expect(pushes.map((p) => p.kind)).toEqual(['directory', 'events']);
  expect(f.snapshot).not.toHaveBeenCalled();
  vi.advanceTimersByTime(31_000);
  f.emit(payload);
  vi.advanceTimersByTime(1);
  expect(pushes.at(-1)).toMatchObject({ kind: 'events', events: [{ payload: { code: 1 } }] });
  stop();
  f.emit(payload);
  expect(payload).toHaveBeenCalledTimes(2);
  f.gateway.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it('有界推送报告缺口，监听失败和一个连接关闭不影响其他连接；销毁主动更新目录', () => {
  const f = fixture(),
    pushes: ObservationPush[] = [];
  const bad = vi.fn(() => {
    throw Error('consumer');
  });
  f.gateway.hook.subscribe(bad);
  const stop = f.gateway.hook.subscribe((push) => pushes.push(push));
  for (let i = 0; i < 5; i++) f.emit(() => ({ code: i }));
  expect(() => vi.advanceTimersByTime(1)).not.toThrow();
  expect(pushes.at(-1)).toMatchObject({
    kind: 'events',
    dropped: 3,
    events: [{ payload: { code: 3 } }, { payload: { code: 4 } }],
  });
  f.emit(() => ({ code: 6 }));
  vi.advanceTimersByTime(1);
  expect(bad).toHaveBeenCalledTimes(1);
  f.registration.dispose();
  vi.advanceTimersByTime(1);
  expect(pushes.at(-1)).toMatchObject({ kind: 'directory', producers: [] });
  stop();
  f.gateway.dispose();
});
it('取消订阅丢弃尚未交付的批次，旧 listener 不会被后续排程唤醒', () => {
  const f = fixture(),
    listener = vi.fn();
  const stop = f.gateway.hook.subscribe(listener);
  f.emit(() => ({ code: 1 }));
  stop();
  vi.advanceTimersByTime(10);
  expect(listener).not.toHaveBeenCalled();
  f.gateway.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
