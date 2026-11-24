import { afterEach, expect, it, vi } from 'vitest';
import { createRuntime, type ValidatorIssue } from '../src/index.js';
import {
  getObservedProducer,
  registerObservedProducer,
  observedChildren,
  observedDescendants,
} from '../src/devtools/observation-lifecycle.js';
import { createMetadataReader } from '../src/devtools/observation-reader.js';
import type { ObservationProducer } from '../src/devtools/observation-protocol.js';
import { data, functions, prepared } from './fixtures.js';
export const budget = {
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
function rows(producer: ObservationProducer) {
  const snapshot = producer.snapshot();
  if ('status' in snapshot) throw Error(snapshot.status);
  return snapshot.rows as readonly Record<string, unknown>[];
}
it('真实 Runtime 实例目录跟随移动/删除/重建，查询不触发 Reaction，旧生产者销毁失效', async () => {
  vi.stubGlobal('window', globalThis);
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [
        {
          id: 'r',
          scope: { as: 'row', from: data('/rows'), mode: 'each' },
          watch: [data('/name', 'row')],
          then: [],
        },
      ],
    }),
    data: { rows: [{ name: 'a' }, { name: 'b' }] },
    functions,
  });
  await runtime.flush();
  const producer = getObservedProducer(runtime, budget)!;
  const before = rows(producer).filter((row) => row.record === 'reaction-instance');
  expect(before).toHaveLength(2);
  const oldVersion = producer.revision();
  const scope = runtime.bind({ as: 'row', from: data('/rows'), mode: 'each' })[0]!;
  runtime.dispatch(
    {
      op: 'array.move',
      target: data('/rows'),
      item: { $scope: 'row' },
      position: { kind: 'index', index: 1 },
    },
    scope,
  );
  expect(
    rows(producer)
      .filter((row) => row.record === 'reaction-instance')
      .map((row) => row.entityId)
      .sort(),
  ).toEqual(before.map((row) => row.entityId).sort());
  expect(producer.revision()).toBeGreaterThan(oldVersion);
  runtime.dispatch({ op: 'set', target: data('/rows'), value: [{ name: 'a' }, { name: 'b' }] });
  const after = rows(producer).filter((row) => row.record === 'reaction-instance');
  expect(after.every((row) => before.every((old) => old.entityId !== row.entityId))).toBe(true);
  const events = runtime.diagnostics().length;
  rows(producer);
  rows(producer);
  expect(runtime.diagnostics()).toHaveLength(events);
  runtime.dispose();
  expect(producer.snapshot()).toEqual({ status: 'disposed' });
  expect(getObservedProducer(runtime, budget)).toBeUndefined();
});
it('校验目录复用真实 Work/Call 编号，迟到返回不会恢复失效来源；查询不启动额外请求', async () => {
  vi.stubGlobal('window', globalThis);
  const tasks: Array<(issues: readonly ValidatorIssue[]) => void> = [];
  const check = vi.fn(() => ({
    result: new Promise<readonly ValidatorIssue[]>((resolve) => tasks.push(resolve)),
  }));
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          validator: 'check',
          target: data('/name'),
          watch: [data('/name')],
        },
      ],
    }),
    data: { name: 'a' },
    host: { validators: { check } },
  });
  const call = runtime.validate();
  const producer = getObservedProducer(runtime, budget)!;
  const pending = rows(producer);
  expect(pending).toContainEqual(
    expect.objectContaining({ record: 'validation-work', phase: 'pending' }),
  );
  expect(pending).toContainEqual(expect.objectContaining({ record: 'validation-call', callId: 1 }));
  rows(producer);
  expect(check).toHaveBeenCalledTimes(1);
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'b' });
  expect((await call).status).toBe('stale');
  await runtime.flush();
  const newest = rows(producer).find(
    (row) => row.record === 'validation-work' && row.phase === 'pending',
  )!;
  tasks[0]!([{ target: data('/name'), code: 'old' }]);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(rows(producer)).toContainEqual(
    expect.objectContaining({ record: 'validation-work', workId: newest.workId, phase: 'pending' }),
  );
  tasks.at(-1)!([]);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(rows(producer)).toContainEqual(
    expect.objectContaining({ record: 'validation-source', ruleId: 'remote', status: 'valid' }),
  );
  runtime.dispose();
});
it('重入协调期间返回 busy；父子逆序注册、释放和重挂使用不同代次', () => {
  vi.stubGlobal('window', globalThis);
  const runtime = createRuntime({ prepared: prepared(), data: { name: 'a' } });
  const producer = getObservedProducer(runtime, budget)!;
  let status: unknown;
  runtime.observe([data('/name')], () => {
    status = producer.snapshot();
  });
  runtime.dispatch({ op: 'set', target: data('/name'), value: 'b' });
  expect(status).toEqual({ status: 'busy' });
  runtime.dispose();
  const parent = {},
    child = {};
  const factory = (ref: ObservationProducer['ref']) =>
    createMetadataReader(ref, budget.maxBytes, () => ({ rows: [] }));
  const stopChild = registerObservedProducer(child, factory, parent);
  const stopParent = registerObservedProducer(parent, factory);
  const old = getObservedProducer(child, budget)!;
  expect(observedChildren(parent, 10)).toHaveLength(1);
  expect(observedDescendants(parent, budget)).toHaveLength(1);
  stopParent();
  expect(old.snapshot()).toEqual({ status: 'disposed' });
  stopChild();
  const stopAgain = registerObservedProducer(child, factory);
  expect(getObservedProducer(child, budget)!.ref).not.toEqual(old.ref);
  expect(() => old.inputVersion()).toThrow('disposed');
  stopAgain();
});
it('生产者退出立即释放已接入 Gateway 的快照与录制会话', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', globalThis);
  const { ObservationGateway } = await import('../src/devtools/observation-gateway.js');
  const runtime = createRuntime({ prepared: prepared(), data: { name: 'a' } });
  const producer = getObservedProducer(runtime, budget)!;
  const gateway = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 2,
      maxSnapshotBytes: budget.maxBytes,
      maxEvents: 10,
      maxEventBytes: 10000,
      maxPageSize: 10,
    },
    {
      now: () => Date.now(),
      token: () => crypto.randomUUID(),
      schedule(callback, delay) {
        const timer = setTimeout(callback, delay);
        return () => clearTimeout(timer);
      },
    },
    2,
  );
  gateway.register(producer, { kind: 'runtime', label: 'runtime', capabilities: ['metadata'] });
  const opened = gateway.hook.request({
    version: 2,
    requestId: 'open',
    op: 'openObservation',
    producer: producer.ref,
  }).result;
  if (opened.status !== 'ok' || !('sessionId' in opened)) throw Error('open');
  expect(vi.getTimerCount()).toBe(2);
  runtime.dispose();
  expect(vi.getTimerCount()).toBe(0);
  expect(
    gateway.hook.request({
      version: 2,
      requestId: 'page',
      op: 'readSnapshotPage',
      producer: producer.ref,
      sessionId: opened.sessionId,
      snapshotId: opened.snapshotId,
    }).result.status,
  ).toBe('invalid-reference');
  gateway.dispose();
  vi.useRealTimers();
});
it('观测注册环境异常不阻断真实 Runtime 创建和业务写入', () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal(
    'WeakRef',
    class {
      constructor() {
        throw Error('tool environment failed');
      }
    },
  );
  const runtime = createRuntime({ prepared: prepared(), data: { name: 'a' } });
  expect(runtime.dispatch({ op: 'set', target: data('/name'), value: 'b' }).ok).toBe(true);
  expect(runtime.snapshot()).toEqual({ name: 'b' });
  expect(getObservedProducer(runtime, budget)).toBeUndefined();
  runtime.dispose();
});
it('目录上限在复制前拒绝，创建时预算不被调用者后续修改', () => {
  const parent = {},
    child = {};
  const factory = (ref: ObservationProducer['ref']) =>
    createMetadataReader(ref, budget.maxBytes, () => ({ rows: [] }));
  const stopParent = registerObservedProducer(parent, factory);
  const stopChild = registerObservedProducer(child, factory, parent);
  expect(() => observedChildren(parent, 0)).toThrow('budget');
  stopChild();
  stopParent();
  const owner = {};

  const configured = { ...budget };
  const stop = registerObservedProducer(owner, (ref, fixed) => {
    return createMetadataReader(ref, budget.maxBytes, () => ({ rows: [{ limit: fixed.maxRows }] }));
  });
  const observed = getObservedProducer(owner, configured)!;
  configured.maxRows = 1;
  expect(rows(observed)).toEqual([{ limit: budget.maxRows }]);
  stop();
});

it('校验问题保留所属 Source 和稳定字段位置，不复制完整错误输入', async () => {
  vi.stubGlobal('window', globalThis);
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'adult',
          kind: 'internal',
          assert: { op: 'core.gte', args: [{ ref: data('/age') }, 18] },
          issue: { target: data('/age'), code: 'adult-required' },
        },
      ],
    }),
    data: { age: 10, name: 'secret' },
    functions,
  });
  await runtime.flush();
  const result = rows(getObservedProducer(runtime, budget)!);
  const source = result.find(
    (row) => row.record === 'validation-source' && row.ruleId === 'adult',
  )!;
  expect(result).toContainEqual(
    expect.objectContaining({
      record: 'validation-issue',
      source: source.entityId,
      code: 'adult-required',
      field: { path: '/age' },
    }),
  );
  expect(JSON.stringify(result)).not.toContain('secret');
  runtime.dispose();
});
it('释放回调重入注册同一 owner 时，旧清理不删除新代次', () => {
  const owner = {};
  const factory = (ref: ObservationProducer['ref']) =>
    createMetadataReader(ref, budget.maxBytes, () => ({ rows: [] }));
  const stop = registerObservedProducer(owner, factory);
  const old = getObservedProducer(owner, budget)!;
  let stopNew = () => {};
  old.onDispose!(() => {
    stopNew = registerObservedProducer(owner, factory);
  });
  stop();
  const current = getObservedProducer(owner, budget)!;
  expect(current.ref).not.toEqual(old.ref);
  expect(old.snapshot()).toEqual({ status: 'disposed' });
  expect(current.snapshot()).toMatchObject({ rows: [] });
  stopNew();
});
it('完整多 Scope 绑定保留，普通对象失活再激活不能复活旧规则实例', async () => {
  vi.stubGlobal('window', globalThis);
  const scope = [
    { as: 'group', from: data('/absent'), mode: 'one' as const },
    { as: 'row', from: data('/rows'), mode: 'each' as const },
  ] as const;
  const runtime = createRuntime({
    prepared: prepared({
      reactions: [{ id: 'r', scope: [...scope], watch: [data('/age', 'row')], then: [] }],
    }),
    data: { absent: { child: 1 }, rows: [{ age: 10 }] },
  });
  await runtime.flush();
  const producer = getObservedProducer(runtime, budget)!;
  const original = rows(producer).find((row) => row.record === 'reaction-instance')!;
  expect(original.binding).toMatchObject({
    group: { path: '/absent' },
    row: { member: expect.any(String), path: '' },
  });
  runtime.dispatch({ op: 'remove', target: data('/absent') });
  expect(rows(producer).some((row) => row.record === 'reaction-instance')).toBe(false);
  runtime.dispatch({ op: 'set', target: data('/absent'), value: { child: 1 } });
  const next = rows(producer).find((row) => row.record === 'reaction-instance')!;
  expect(next.binding).toEqual(original.binding);
  expect(next.entityId).not.toBe(original.entityId);
  runtime.dispose();
});
