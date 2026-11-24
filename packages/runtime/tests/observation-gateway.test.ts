import { afterEach, expect, it, vi } from 'vitest';
import { ObservationGateway } from '../src/devtools/observation-gateway.js';
import type {
  ObservationProducer,
  ObservationCommand,
} from '../src/devtools/observation-protocol.js';
afterEach(() => vi.useRealTimers());
function fixture() {
  vi.useFakeTimers();
  const gateway = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 2,
      maxSnapshotBytes: 1024,
      maxEvents: 4,
      maxEventBytes: 1024,
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
    8,
  );
  const snapshot = vi.fn(() => ({ revision: 0, rows: [{ id: 'rule' }] }));
  const inspect = vi.fn(() => ({
    status: 'ok' as const,
    version: { dataRevision: 0, contextRevision: 0 },
    value: 'secret',
  }));
  const producer: ObservationProducer = {
    ref: { producerId: 'runtime', epoch: 'first' },
    snapshot,
    inspect,
    revision: () => 0,
    inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
  };
  const registration = gateway.register(producer, {
    kind: 'runtime',
    label: 'form',
    capabilities: ['metadata', 'values', 'events'],
  });
  const request = (command: ObservationCommand, requestId: string = crypto.randomUUID()) =>
    gateway.hook.request({ ...command, requestId, version: 2 }).result;
  const open = () => {
    const result = request({ op: 'openObservation', producer: producer.ref });
    if (result.status !== 'ok' || !('sessionId' in result)) throw Error('open');
    return { result, target: { producer: producer.ref, sessionId: result.sessionId } };
  };
  return { gateway, producer, snapshot, inspect, registration, request, open };
}
it('发现仅返回目录与真实能力；旧版和未知操作均不读生产者', () => {
  const f = fixture();
  expect(f.request({ op: 'discover' })).toMatchObject({
    status: 'ok',
    producers: [{ ref: f.producer.ref }],
  });
  expect(
    f.gateway.hook.request({ version: 1, requestId: 'old', op: 'discover' }).result.status,
  ).toBe('incompatible');
  expect(
    f.gateway.hook.request({ version: 2, requestId: 'bad', op: 'dispatch' }).result.status,
  ).toBe('invalid-request');
  expect(f.snapshot).not.toHaveBeenCalled();
  expect(f.inspect).not.toHaveBeenCalled();
  f.gateway.dispose();
});
it('路由核对 epoch / session 归属，不执行未知字段或 getter', () => {
  const f = fixture();
  const a = f.open();
  const getter = vi.fn(() => 'discover');
  expect(
    f.gateway.hook.request(
      Object.defineProperty({ version: 2, requestId: 'bad' }, 'op', { get: getter }),
    ).result.status,
  ).toBe('invalid-request');
  expect(getter).not.toHaveBeenCalled();
  expect(
    f.request({
      op: 'readUpdates',
      ...a.target,
      producer: { ...f.producer.ref, epoch: 'old' },
      cursor: a.result.cursor,
    }).status,
  ).toBe('invalid-reference');
  expect(
    f.gateway.hook.request({
      version: 2,
      requestId: 'bad',
      op: 'closeObservation',
      ...a.target,
      extra: () => {},
    }).result.status,
  ).toBe('invalid-request');
  expect(f.request({ op: 'readUpdates', ...a.target, cursor: a.result.cursor }).status).toBe('ok');
  f.gateway.dispose();
});
it('真实会话链路分页、显式录制、重试确认、按版本取值与释放', () => {
  const f = fixture();
  const a = f.open();
  expect(
    f.request({ op: 'readSnapshotPage', ...a.target, snapshotId: a.result.snapshotId }),
  ).toMatchObject({ rows: [{ id: 'rule' }] });
  f.registration.publish('diagnostic', { label: 'before' });
  expect(
    f.gateway.hook.request({ version: 2, requestId: 'record', op: 'startCapture', ...a.target })
      .result.status,
  ).toBe('invalid-request');
  f.registration.publish('diagnostic', { label: 'during' });
  const batch = f.request({ op: 'readUpdates', ...a.target, cursor: a.result.cursor });
  expect(f.request({ op: 'readUpdates', ...a.target, cursor: a.result.cursor })).toEqual(batch);
  expect(batch).toMatchObject({
    events: [{ payload: { label: 'before' } }, { payload: { label: 'during' } }],
  });
  expect(f.inspect).not.toHaveBeenCalled();
  expect(
    f.request({
      op: 'inspectValue',
      ...a.target,
      expectedVersion: { dataRevision: 0, contextRevision: 0 },
      location: { path: '' },
    }),
  ).toMatchObject({ value: 'secret' });
  expect(
    f.request({ op: 'locateEvidence', ...a.target, event: { ...f.producer.ref, sequence: 1 } })
      .status,
  ).toBe('unsupported');
  expect(f.request({ op: 'closeObservation', ...a.target }).status).toBe('closed');
  expect(f.request({ op: 'readUpdates', ...a.target, cursor: a.result.cursor }).status).toBe(
    'session-expired',
  );
  expect(vi.getTimerCount()).toBe(0);
  f.gateway.dispose();
});
it('生产者退出释放会话；相同 id 新 epoch 不接受旧引用或旧发布句柄', () => {
  const f = fixture();
  const a = f.open();
  f.registration.dispose();
  expect(vi.getTimerCount()).toBe(0);
  const next = { ...f.producer, ref: { producerId: 'runtime', epoch: 'second' } };
  f.gateway.register(next, { kind: 'runtime', label: 'new', capabilities: ['metadata'] });
  f.registration.publish('diagnostic', {});
  f.registration.dispose();
  expect(f.request({ op: 'openObservation', producer: f.producer.ref }).status).toBe(
    'invalid-reference',
  );
  expect(f.request({ op: 'discover' })).toMatchObject({ producers: [{ ref: next.ref }] });
  expect(f.request({ op: 'readUpdates', ...a.target, cursor: a.result.cursor }).status).toBe(
    'invalid-reference',
  );
  f.gateway.dispose();
});
it('能力缺失明确 unsupported，跨生产者会话不能借用；重复注册不替换现有生产者', () => {
  const f = fixture();
  const a = f.open();
  const other = { ...f.producer, ref: { producerId: 'view', epoch: 'first' } };
  f.gateway.register(other, { kind: 'view', label: 'view', capabilities: ['metadata'] });
  const opened = f.request({ op: 'openObservation', producer: other.ref });
  if (opened.status !== 'ok' || !('sessionId' in opened)) throw Error('open');
  const target = { producer: other.ref, sessionId: opened.sessionId };
  expect(
    f.gateway.hook.request({ version: 2, requestId: 'record', op: 'startCapture', ...target })
      .result.status,
  ).toBe('invalid-request');
  expect(
    f.request({
      op: 'inspectValue',
      ...target,
      expectedVersion: { dataRevision: 0, contextRevision: 0 },
      location: { path: '' },
    }).status,
  ).toBe('unsupported');
  expect(f.inspect).not.toHaveBeenCalled();
  expect(
    f.request({ op: 'readUpdates', ...a.target, producer: other.ref, cursor: a.result.cursor })
      .status,
  ).toBe('session-expired');
  expect(() =>
    f.gateway.register(other, { kind: 'view', label: 'duplicate', capabilities: ['metadata'] }),
  ).toThrow('already registered');
  expect(
    f.request({ op: 'readSnapshotPage', ...target, snapshotId: opened.snapshotId }).status,
  ).toBe('ok');
  f.gateway.dispose();
});
it('位置和输入版本校验失败在读取前拒绝；同版未实现能力不触发业务', () => {
  const f = fixture();
  const a = f.open();
  for (const location of [
    { path: 'not-pointer' },
    { path: '/bad~escape' },
    { path: '', member: '' },
  ]) {
    expect(
      f.gateway.hook.request({
        op: 'inspectValue',
        ...a.target,
        version: 2,
        requestId: 'bad',
        expectedVersion: { dataRevision: 0, contextRevision: 0 },
        location,
      }).result.status,
    ).toBe('invalid-request');
  }
  for (const dataRevision of [-1, NaN, 0.5]) {
    expect(
      f.gateway.hook.request({
        op: 'inspectValue',
        ...a.target,
        version: 2,
        requestId: 'bad',
        expectedVersion: { dataRevision, contextRevision: 0 },
        location: { path: '' },
      }).result.status,
    ).toBe('invalid-request');
  }
  expect(f.inspect).not.toHaveBeenCalled();
  f.gateway.dispose();
});
