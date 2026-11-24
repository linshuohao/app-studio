import { afterEach, expect, it, vi } from 'vitest';
import {
  ObservationSessions,
  type ObservationPlatform,
} from '../src/devtools/observation-session.js';
import type {
  MetadataSnapshot,
  ObservationProducer,
} from '../src/devtools/observation-protocol.js';

afterEach(() => vi.useRealTimers());
function fixture(overrides = {}, platformOverrides: Partial<ObservationPlatform> = {}) {
  vi.useFakeTimers();
  let revision = 0;
  let dataRevision = 0;
  let contextRevision = 0;
  const version = () => ({ dataRevision, contextRevision });
  const rows = [
    { id: 'a', label: 'before' },
    { id: 'b', label: 'second' },
  ];
  const snapshot = vi.fn((): MetadataSnapshot => ({ revision, rows }));
  const inspect = vi.fn(() => ({ status: 'ok' as const, version: version(), value: 'secret' }));
  const producer: ObservationProducer = {
    ref: { producerId: 'runtime-1', epoch: 'epoch-1' },
    snapshot,
    inspect,
    revision: () => revision,
    inputVersion: version,
  };
  const sessions = new ObservationSessions(
    producer,
    {
      leaseMs: 1000,
      snapshotMs: 100,
      maxSessions: 2,
      maxSnapshotBytes: 4096,
      maxEvents: 2,
      maxEventBytes: 4096,
      maxPageSize: 1,
      ...overrides,
    },
    {
      now: () => Date.now(),
      token: () => crypto.randomUUID(),
      schedule(callback, delay) {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
      ...platformOverrides,
    },
  );
  const open = () => {
    const result = sessions.openObservation(producer.ref);
    if (result.status !== 'ok') throw Error(result.status);
    return result;
  };
  return {
    sessions,
    producer,
    snapshot,
    inspect,
    rows,
    open,
    version,
    change: () => revision++,
    changeData: () => dataRevision++,
    changeContext: () => contextRevision++,
  };
}
it('版本不匹配时拒绝，不读取元数据或业务值', () => {
  const f = fixture();
  expect(f.sessions.discover(1).status).toBe('incompatible');
  expect(f.sessions.discover(2).status).toBe('ok');
  expect(f.snapshot).not.toHaveBeenCalled();
  expect(f.inspect).not.toHaveBeenCalled();
  f.sessions.dispose();
});
it('分页固定原始快照，篡改/跨会话游标拒绝，过期不混入新页', () => {
  const f = fixture();
  const a = f.open(),
    b = f.open();
  f.rows[1]!.label = 'changed';
  f.change();
  const first = f.sessions.readSnapshotPage(a.sessionId, a.snapshotId);
  expect(first.status).toBe('ok');
  if (first.status !== 'ok') return;
  expect(first.rows).toEqual([{ id: 'a', label: 'before' }]);
  expect(f.sessions.readSnapshotPage(b.sessionId, a.snapshotId).status).toBe('invalid-reference');
  expect(f.sessions.readSnapshotPage(a.sessionId, a.snapshotId, 'forged').status).toBe(
    'invalid-cursor',
  );
  const second = f.sessions.readSnapshotPage(a.sessionId, a.snapshotId, first.nextCursor);
  expect(second).toMatchObject({ status: 'ok', revision: 0, rows: [{ id: 'b', label: 'second' }] });
  vi.advanceTimersByTime(101);
  expect(f.sessions.readSnapshotPage(a.sessionId, a.snapshotId).status).toBe('snapshot-expired');
  expect(f.inspect).not.toHaveBeenCalled();
  f.sessions.dispose();
});
it('溢出明确报告缺口，未来和跨会话确认不能静默删除数据', () => {
  const f = fixture();
  const a = f.open(),
    b = f.open();
  for (let i = 0; i < 4; i++) f.sessions.publish('diagnostic', { i });
  const result = f.sessions.readUpdates(a.sessionId, a.cursor);
  expect(result).toMatchObject({
    status: 'ok',
    dropped: 2,
    events: [expect.anything(), expect.anything()],
  });
  expect(f.sessions.readUpdates(a.sessionId, b.cursor).status).toBe('invalid-cursor');
  expect(f.sessions.readUpdates(a.sessionId, 'future').status).toBe('invalid-cursor');
  expect(f.sessions.readUpdates(a.sessionId, a.cursor)).toEqual(result);
  f.sessions.dispose();
});
it('错误 epoch、容量、超时和销毁明确返回；工具回调错误隔离', () => {
  const f = fixture();
  expect(f.sessions.openObservation({ ...f.producer.ref, epoch: 'old' }).status).toBe(
    'invalid-reference',
  );
  const a = f.open();
  f.open();
  expect(f.sessions.openObservation(f.producer.ref).status).toBe('budget-exceeded');
  f.inspect.mockImplementation(() => {
    throw Error('tool failed');
  });
  expect(
    f.sessions.inspectValue(a.sessionId, { dataRevision: 0, contextRevision: 0 }, { path: '' })
      .status,
  ).toBe('unavailable');
  vi.advanceTimersByTime(1001);
  expect(f.sessions.readUpdates(a.sessionId, a.cursor).status).toBe('session-expired');
  expect(f.sessions.openObservation(f.producer.ref).status).toBe('ok');
  f.sessions.dispose();
  expect(f.sessions.openObservation(f.producer.ref).status).toBe('disposed');
});
it('超大元数据拒绝而非返回伪完整快照；值版本在适配调用前校验', () => {
  const f = fixture({ maxSnapshotBytes: 10 });
  expect(f.sessions.openObservation(f.producer.ref).status).toBe('budget-exceeded');
  f.sessions.dispose();
  const g = fixture();
  const a = g.open();
  g.changeData();
  expect(
    g.sessions.inspectValue(a.sessionId, { dataRevision: 0, contextRevision: 0 }, { path: '' })
      .status,
  ).toBe('version-mismatch');
  expect(g.inspect).not.toHaveBeenCalled();
  g.sessions.dispose();
});
it('确认令牌只确认已交付边界，不能吃掉回复后的新事件', () => {
  const f = fixture({ maxEvents: 4 });
  const a = f.open();
  f.sessions.publish('diagnostic', { i: 1 });
  const first = f.sessions.readUpdates(a.sessionId, a.cursor);
  if (first.status !== 'ok') throw Error(first.status);
  f.sessions.publish('diagnostic', { i: 2 });
  expect(f.sessions.readUpdates(a.sessionId, a.cursor)).toEqual(first);
  const second = f.sessions.readUpdates(a.sessionId, first.nextCursor);
  expect(second).toMatchObject({ status: 'ok', dropped: 0, events: [{ payload: { i: 2 } }] });
  f.sessions.dispose();
});
it('超大/抛错事件产生缺口，缺口本身不依赖普通事件入队', () => {
  const f = fixture({ maxEventBytes: 256 });
  const a = f.open();
  f.sessions.publish('diagnostic', { huge: 'x'.repeat(1000) });
  const getter = vi.fn(() => {
    throw Error('must not invoke');
  });
  const payload = Object.defineProperty({}, 'value', { enumerable: true, get: getter });
  expect(() => f.sessions.publish('diagnostic', payload)).not.toThrow();
  expect(getter).not.toHaveBeenCalled();
  expect(f.sessions.readUpdates(a.sessionId, a.cursor)).toMatchObject({
    status: 'ok',
    dropped: 2,
    events: [],
  });
  f.sessions.dispose();
});
it('租约到期无需再查询即释放会话，新会话拒绝旧句柄', () => {
  const f = fixture({ maxSessions: 1 });
  const a = f.open();
  vi.advanceTimersByTime(1001);
  const b = f.open();
  expect(b.sessionId).not.toBe(a.sessionId);
  expect(f.sessions.readSnapshotPage(b.sessionId, a.snapshotId).status).toBe('invalid-reference');
  expect(f.sessions.readUpdates(b.sessionId, a.cursor).status).toBe('invalid-cursor');
  f.sessions.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
it('生产者快照重入改变版本时返回 busy，不登记不一致会话', () => {
  const f = fixture();
  f.snapshot.mockImplementation(() => {
    f.change();
    return { revision: 0, rows: [] };
  });
  expect(f.sessions.openObservation(f.producer.ref).status).toBe('busy');
  expect(vi.getTimerCount()).toBe(0);
  f.sessions.dispose();
});
it('观察会话自动接收元数据与业务诊断', () => {
  const f = fixture();
  const a = f.open();
  f.sessions.publish('diagnostic', { message: 'not captured' });
  f.sessions.publish('metadata.changed', { revision: 1 });
  expect(f.sessions.readUpdates(a.sessionId, a.cursor)).toMatchObject({
    status: 'ok',
    dropped: 0,
    events: [{ kind: 'diagnostic' }, { kind: 'metadata.changed' }],
  });
  f.sessions.dispose();
});

it('快照读取重入不能绕过会话容量', () => {
  const f = fixture({ maxSessions: 1 });
  f.snapshot.mockImplementation(() => {
    expect(f.sessions.openObservation(f.producer.ref).status).toBe('busy');
    return { revision: 0, rows: [] };
  });
  expect(f.open().status).toBe('ok');
  expect(f.sessions.openObservation(f.producer.ref).status).toBe('budget-exceeded');
  f.sessions.dispose();
});
it('值查询同时核对 Data / Context，元数据版本不替代输入版本', () => {
  const f = fixture();
  const a = f.open();
  f.change();
  expect(f.sessions.inspectValue(a.sessionId, f.version(), { path: '' }).status).toBe('ok');
  const old = f.version();
  f.changeContext();
  expect(f.sessions.inspectValue(a.sessionId, old, { path: '' })).toEqual({
    status: 'version-mismatch',
    currentVersion: f.version(),
  });
  f.inspect.mockImplementation(() => {
    const valueVersion = f.version();
    f.changeData();
    return { status: 'ok', version: valueVersion, value: 'secret' };
  });
  expect(f.sessions.inspectValue(a.sessionId, f.version(), { path: '' }).status).toBe('busy');
  f.sessions.dispose();
});
it('巨大稀疏数组在遍历前拒绝，事件失败仍记录缺口', () => {
  const f = fixture({ maxEventBytes: 256 });
  const a = f.open();
  f.sessions.publish('diagnostic', new Array(1_000_000_000));
  expect(f.sessions.readUpdates(a.sessionId, a.cursor)).toMatchObject({ dropped: 1, events: [] });
  f.sessions.dispose();
});
it('值读取期间销毁或关闭，不返回成功也不遗留孤立租约', () => {
  for (const destroy of [true, false]) {
    const f = fixture();
    const a = f.open();
    f.inspect.mockImplementation(() => {
      if (destroy) f.sessions.dispose();
      else f.sessions.closeObservation(a.sessionId);
      return { status: 'ok', version: f.version(), value: 'secret' };
    });
    expect(f.sessions.inspectValue(a.sessionId, f.version(), { path: '' }).status).toBe(
      destroy ? 'disposed' : 'session-expired',
    );
    expect(vi.getTimerCount()).toBe(0);
    f.sessions.dispose();
  }
});
it('快照租期内任意已发页游标重试稳定，不因向后翻页失效', () => {
  const f = fixture();
  f.rows.push({ id: 'c', label: 'third' }, { id: 'd', label: 'fourth' });
  const a = f.open();
  const first = f.sessions.readSnapshotPage(a.sessionId, a.snapshotId);
  if (first.status !== 'ok') throw Error(first.status);
  const second = f.sessions.readSnapshotPage(a.sessionId, a.snapshotId, first.nextCursor);
  if (second.status !== 'ok') throw Error(second.status);
  f.sessions.readSnapshotPage(a.sessionId, a.snapshotId, second.nextCursor);
  expect(f.sessions.readSnapshotPage(a.sessionId, a.snapshotId)).toEqual(first);
  expect(f.sessions.readSnapshotPage(a.sessionId, a.snapshotId, first.nextCursor)).toEqual(second);
  f.sessions.dispose();
});

it('创建租约失败回收已创建快照定时器', () => {
  let scheduled = 0;
  const f = fixture(
    {},
    {
      schedule(callback, delay) {
        if (++scheduled === 2) throw Error('timer unavailable');
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
    },
  );
  expect(f.sessions.openObservation(f.producer.ref).status).toBe('unavailable');
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(1001);
  f.sessions.dispose();
});
it('missing / mismatch 结果不借用生产者的可变版本对象', () => {
  const f = fixture();
  const a = f.open();
  const version = { dataRevision: 0, contextRevision: 0 };
  f.producer.inspect = () => ({ status: 'missing', version });
  const missing = f.sessions.inspectValue(a.sessionId, f.version(), { path: '' });
  f.producer.inspect = () => ({ status: 'version-mismatch', currentVersion: version });
  const mismatch = f.sessions.inspectValue(a.sessionId, f.version(), { path: '' });
  version.dataRevision = 42;
  expect(missing).toMatchObject({ status: 'missing', version: { dataRevision: 0 } });
  expect(mismatch).toMatchObject({
    status: 'version-mismatch',
    currentVersion: { dataRevision: 0 },
  });
  f.sessions.dispose();
});
it('续租失败返回 unavailable，原租约仍到期释放，不泄漏会话', () => {
  let scheduled = 0;
  const f = fixture(
    {},
    {
      schedule(callback, delay) {
        if (++scheduled === 3) throw Error('timer unavailable');
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
    },
  );
  const a = f.open();
  expect(f.sessions.readSnapshotPage(a.sessionId, a.snapshotId).status).toBe('unavailable');
  vi.advanceTimersByTime(1001);
  expect(f.sessions.readUpdates(a.sessionId, a.cursor).status).toBe('session-expired');
  expect(vi.getTimerCount()).toBe(0);
  f.sessions.dispose();
});

it('固定快照加有序元数据增量等于终点目录，回复重试固定且删除身份显式', () => {
  const f = fixture();
  const open = f.open();
  const page = f.sessions.readSnapshotPage(open.sessionId, open.snapshotId);
  f.rows[0]!.label = 'updated';
  f.rows.splice(1, 1);
  f.rows.push({ id: 'new', label: 'new' });
  f.change();
  const delta = f.sessions.readMetadataChanges(open.sessionId, open.revision);
  expect(delta).toMatchObject({
    status: 'ok',
    baseRevision: 0,
    revision: 1,
    removed: ['["undefined","b"]'],
  });
  if (delta.status !== 'ok') throw Error(delta.status);
  expect(delta.upserts.map((item) => item.row)).toEqual(f.rows);
  expect(Object.isFrozen(delta.upserts)).toBe(true);
  f.rows[0]!.label = 'newer';
  f.change();
  expect(f.sessions.readMetadataChanges(open.sessionId, 0)).toBe(delta);
  const next = f.sessions.readMetadataChanges(open.sessionId, delta.revision);
  expect(next).toMatchObject({
    status: 'ok',
    baseRevision: 1,
    revision: 2,
    upserts: [{ row: { id: 'a', label: 'newer' } }],
  });
  expect(page).toMatchObject({ rows: [{ label: 'before' }] });
  expect(f.sessions.readMetadataChanges(open.sessionId, 999)).toMatchObject({
    status: 'invalid-cursor',
  });
  f.sessions.dispose();
});
it('元数据增量拒绝读取重入的混合切点和已关闭会话', () => {
  const f = fixture();
  const open = f.open();
  f.snapshot.mockImplementation(() => {
    f.sessions.closeObservation(open.sessionId);
    return { revision: 1, rows: [] };
  });
  expect(f.sessions.readMetadataChanges(open.sessionId, 0).status).not.toBe('ok');
  f.sessions.dispose();
});
