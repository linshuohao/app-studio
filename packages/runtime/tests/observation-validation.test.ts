import { afterEach, expect, it, vi } from 'vitest';
import { createRuntime, type ValidatorIssue } from '../src/index.js';
import { getObservedProducer } from '../src/devtools/observation-lifecycle.js';
import { ObservationGateway } from '../src/devtools/observation-gateway.js';
import type { ObservationCommand } from '../src/devtools/observation-protocol.js';
import { data, functions, prepared } from './fixtures.js';
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
});
async function fixture() {
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers();
  const tasks: Array<{
    resolve: (issues: readonly ValidatorIssue[]) => void;
    reject: (e: unknown) => void;
  }> = [];
  const cancel = vi.fn();
  const validator = vi.fn(() => ({
    result: new Promise<readonly ValidatorIssue[]>((resolve, reject) =>
      tasks.push({ resolve, reject }),
    ),
    cancel,
  }));
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'remote',
          kind: 'external',
          validator: 'remote',
          target: data('/name'),
          watch: [data('/name')],
        },
      ],
    }),
    data: { name: 'a' },
    functions,
    host: { validators: { remote: validator } },
  });
  await runtime.flush();
  const producer = getObservedProducer(runtime, {
    definition: { maxRows: 5000, maxVisits: 100000, maxDepth: 64, maxTextBytes: 1000000 },
    topology: { maxNodes: 10000, maxDepth: 64, maxTextBytes: 1000000 },
    maxRows: 10000,
    maxBytes: 2000000,
  })!;
  const gateway = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 4,
      maxSnapshotBytes: 2000000,
      maxEvents: 500,
      maxEventBytes: 500000,
      maxPageSize: 1000,
    },
    {
      now: () => Date.now(),
      token: () => crypto.randomUUID(),
      schedule(callback, delay) {
        const t = setTimeout(callback, delay);
        return () => clearTimeout(t);
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
  const open = request({ op: 'openObservation', producer: producer.ref });
  if (open.status !== 'ok' || !('sessionId' in open)) throw Error('open');
  const target = { producer: producer.ref, sessionId: open.sessionId };
  const read = () => {
    const r = request({ op: 'readUpdates', ...target, cursor: open.cursor });
    if (r.status !== 'ok' || !('events' in r)) throw Error('read');
    return r.events;
  };
  const finish = () => {
    runtime.dispose();
    gateway.dispose();
  };
  return { runtime, tasks, validator, cancel, read, finish };
}
it('旧Call stale不取消共享Work；新Call关联同一网络工作并独立完成', async () => {
  const f = await fixture();
  const a = f.runtime.validate(),
    b = f.runtime.validate();
  expect((await a).status).toBe('stale');
  expect(f.validator).toHaveBeenCalledTimes(1);
  expect(f.cancel).not.toHaveBeenCalled();
  f.tasks[0]!.resolve([]);
  expect((await b).status).toBe('valid');
  const events = f.read();
  const calls = events.filter((e) => e.kind === 'call.started');
  expect(calls).toHaveLength(2);
  expect(calls.every((e) => e.payload.operation !== null)).toBe(true);
  const attachments = events
    .filter((e) => e.kind === 'call.attached-work')
    .filter((e) => e.payload.reused);
  expect(attachments).toHaveLength(2);
  expect(attachments[0]!.payload.workId).toBe(attachments[1]!.payload.workId);
  expect(
    events.filter(
      (e) => e.kind === 'work.started' && e.payload.workId === attachments[0]!.payload.workId,
    ),
  ).toHaveLength(0);
  expect(events.filter((e) => e.kind === 'call.finished').map((e) => e.payload.outcome)).toEqual([
    'stale',
    'valid',
  ]);
  f.finish();
});
it('旧请求迟到只记录返回和丢弃，不发布或覆盖新输入结果', async () => {
  const f = await fixture();
  f.runtime.dispatch({ op: 'set', target: data('/name'), value: 'b' });
  await f.runtime.flush();
  expect(f.validator).toHaveBeenCalledTimes(2);
  f.tasks[0]!.resolve([{ code: 'old', message: 'secret' }]);
  await Promise.resolve();
  await Promise.resolve();
  f.tasks[1]!.resolve([]);
  await Promise.resolve();
  await Promise.resolve();
  const events = f.read();
  const discarded = events.filter((e) => e.kind === 'work.discarded');
  expect(discarded).toHaveLength(1);
  const workId = discarded[0]!.payload.workId;
  expect(
    events.some((e) => e.kind === 'work.eligibility-revoked' && e.payload.workId === workId),
  ).toBe(true);
  expect(
    events.some((e) => e.kind === 'source.result-published' && e.payload.workId === workId),
  ).toBe(false);
  expect(discarded[0]!.payload.returned).not.toBeNull();
  expect(JSON.stringify(events)).not.toContain('secret');
  expect(f.runtime.getValidation(data('/name')).status).toBe('valid');
  f.finish();
});
it('Context替换只推进Context版本，完整校验入口返回不等于Call结束', async () => {
  const f = await fixture();
  f.runtime.replaceContext({ locale: 'en' });
  await f.runtime.flush();
  const pending = f.runtime.validate();
  const events = f.read();
  expect(events.some((e) => e.kind === 'data.changed')).toBe(false);
  expect(events.filter((e) => e.kind === 'operation.started').map((e) => e.payload.source)).toEqual(
    ['replaceContext', 'validate'],
  );
  expect(events.find((e) => e.kind === 'operation.returned')).toMatchObject({
    payload: { scope: 'entry-return', inputVersion: { dataRevision: 0, contextRevision: 1 } },
  });
  expect(events.some((e) => e.kind === 'call.finished')).toBe(false);
  f.tasks.at(-1)!.resolve([]);
  await pending;
  f.finish();
});

it('工具先连接后初始化及新增成员，新建 Source Work 保留已知操作原因', async () => {
  vi.stubGlobal('window', globalThis);
  vi.useFakeTimers();
  const seed = createRuntime({ prepared: prepared(), functions, data: { name: 'seed' } });
  const { getDevtoolsHook } = await import('../src/devtools/index.js');
  const events: import('../src/devtools/observation-protocol.js').ObservationEvent[] = [];
  const unsubscribe = getDevtoolsHook()!.subscribe((push) => {
    if (push.kind === 'events') events.push(...push.events);
  });
  const runtime = createRuntime({
    prepared: prepared({
      constraints: [
        {
          id: 'member-check',
          kind: 'internal',
          scope: { from: data('/rows'), as: 'person', mode: 'each' },
          assert: true,
          issue: { target: data('/name', 'person'), code: 'test' },
        },
      ],
    }),
    functions,
    data: { rows: [{ name: 'first' }] },
  });
  await runtime.flush();
  await vi.advanceTimersByTimeAsync(0);
  const works = () => {
    const sources = new Set(
      events
        .filter(
          (e) =>
            e.kind === 'entity.added' && JSON.stringify(e.payload.row).includes('member-check'),
        )
        .map((e) => (e.kind === 'entity.added' ? e.payload.entity.entityId : '')),
    );
    return events.filter(
      (e) => e.kind === 'work.created' && sources.has(e.payload.source.entityId),
    );
  };
  expect(works().length).toBeGreaterThan(0);
  expect(works()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          causes: expect.arrayContaining([
            expect.objectContaining({ sequence: expect.any(Number) }),
          ]),
        }),
      }),
    ]),
  );
  const before = events.length;
  runtime.dispatch({
    op: 'array.insert',
    target: data('/rows'),
    position: { kind: 'index', index: 1 },
    value: { name: 'second' },
  });
  await runtime.flush();
  await vi.advanceTimersByTimeAsync(0);
  expect(works().filter((e) => events.indexOf(e) >= before)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        payload: expect.objectContaining({
          causes: expect.arrayContaining([
            expect.objectContaining({ sequence: expect.any(Number) }),
          ]),
        }),
      }),
    ]),
  );
  unsubscribe();
  runtime.dispose();
  seed.dispose();
});
