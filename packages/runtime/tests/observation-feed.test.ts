import { expect, it, vi } from 'vitest';
import { ObservationGateway } from '../src/devtools/observation-gateway.js';
import {
  registerObservedProducer,
  getObservedProducer,
  emitObservedEvent,
} from '../src/devtools/observation-lifecycle.js';
import type { ObservationCommand } from '../src/devtools/observation-protocol.js';
function fixture() {
  const owner = {};
  const snapshot = vi.fn(() => ({ revision: 0, rows: [] }));
  const stop = registerObservedProducer(owner, (ref) => ({
    ref,
    snapshot,
    revision: () => 0,
    inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
    inspect: () => ({ status: 'unsupported' }),
  }));
  const producer = getObservedProducer(owner, {
    definition: { maxRows: 100, maxVisits: 100, maxDepth: 10, maxTextBytes: 10000 },
    topology: { maxNodes: 100, maxDepth: 10, maxTextBytes: 10000 },
    maxRows: 100,
    maxBytes: 10000,
  })!;
  const connect = () => {
    const now = vi.fn(() => 0);
    const gateway = new ObservationGateway(
      {
        leaseMs: 1000,
        snapshotMs: 1000,
        maxSessions: 5,
        maxSnapshotBytes: 10000,
        maxEvents: 10,
        maxEventBytes: 10000,
        maxPageSize: 10,
      },
      { now, token: () => crypto.randomUUID(), schedule: () => () => {} },
      5,
    );
    const registration = gateway.register(producer, {
      kind: 'runtime',
      label: 'test',
      capabilities: ['metadata', 'events'],
    });
    const request = (command: ObservationCommand) =>
      gateway.hook.request({ ...command, version: 2, requestId: crypto.randomUUID() }).result;
    const session = request({ op: 'openObservation', producer: producer.ref });
    if (session.status !== 'ok' || !('sessionId' in session)) throw Error('open');
    const target = { producer: producer.ref, sessionId: session.sessionId };
    const read = () => request({ op: 'readUpdates', ...target, cursor: session.cursor });
    return { gateway, request, target, now, read, registration };
  };
  return { owner, producer, stop, connect, snapshot };
}
it('单个连接时钟故障撤销该会话，不静默恢复窗口，也不吞健康连接事实', () => {
  const f = fixture(),
    broken = f.connect(),
    healthy = f.connect();
  broken.now.mockImplementation(() => {
    throw Error('clock');
  });
  emitObservedEvent(f.owner, 'diagnostic', () => ({ code: 'fact' }));
  expect(healthy.read()).toMatchObject({
    status: 'ok',
    dropped: 0,
    events: [{ kind: 'diagnostic' }],
  });
  broken.now.mockReturnValue(0);
  expect(broken.read()).toEqual({ status: 'session-expired' });
  f.stop();
});
it('事实 DTO 构造失败可见为 gap；无兴趣或解除连接后不构造 DTO', () => {
  const f = fixture();
  const payload = vi.fn(() => {
    throw Error('capture');
  });
  expect(emitObservedEvent(f.owner, 'diagnostic', payload)).toBeUndefined();
  expect(payload).not.toHaveBeenCalled();
  const connection = f.connect();
  emitObservedEvent(f.owner, 'diagnostic', payload);
  expect(connection.read()).toMatchObject({ status: 'ok', events: [], dropped: 1 });
  connection.gateway.dispose();
  emitObservedEvent(f.owner, 'diagnostic', payload);
  expect(payload).toHaveBeenCalledTimes(1);
  f.stop();
});
it('手动发布与真实 feed 共用序号，快照期间重入 feed 拒绝混合切点', () => {
  const f = fixture(),
    connection = f.connect();
  connection.registration.publish('metadata.changed', { reason: 'test' });
  emitObservedEvent(f.owner, 'diagnostic', () => ({ code: 'fact' }));
  const result = connection.read();
  if (result.status !== 'ok' || !('events' in result)) throw Error('read');
  expect(result.events.map((e) => e.ref.sequence)).toEqual([1, 2]);
  const another = connection.request({ op: 'openObservation', producer: f.producer.ref });
  expect(another).toMatchObject({ status: 'ok', cut: { sequence: 2 } });
  f.snapshot.mockImplementationOnce(() => {
    emitObservedEvent(f.owner, 'diagnostic', () => ({ code: 'reentered' }));
    return { revision: 0, rows: [] };
  });
  expect(connection.request({ op: 'openObservation', producer: f.producer.ref })).toEqual({
    status: 'busy',
  });
  f.stop();
});

it('兴趣检查后交付阶段才发生平台故障也撤销会话，不保留伪连续窗口', () => {
  const f = fixture(),
    broken = f.connect(),
    healthy = f.connect();
  broken.now.mockReturnValueOnce(0).mockImplementationOnce(() => {
    throw Error('append-clock');
  });
  emitObservedEvent(f.owner, 'diagnostic', () => ({ code: 'fact' }));
  expect(healthy.read()).toMatchObject({
    status: 'ok',
    dropped: 0,
    events: [{ kind: 'diagnostic' }],
  });
  expect(broken.read()).toEqual({ status: 'session-expired' });
  f.stop();
});
