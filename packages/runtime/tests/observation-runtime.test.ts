import { afterEach, expect, it, vi } from 'vitest';
import { DataStore } from '../src/data/store.js';
import { ObservationGateway } from '../src/devtools/observation-gateway.js';
import { createRuntimeMetadataProducer } from '../src/devtools/observation-runtime.js';
import type { ObservationCommand, MetadataValue } from '../src/devtools/observation-protocol.js';
import { prepared, data } from './fixtures.js';
afterEach(() => vi.useRealTimers());
it('Compiler Prepared + 真实 DataStore 经过 Gateway 固定分页，值只在显式检查时出现', () => {
  vi.useFakeTimers();
  const store = new DataStore({ name: 'secret', age: 42, rows: [{ name: 'child' }] });
  let coordinating = false;
  const capture = vi.fn(() => ({
    view: store.capture(),
    contextRevision: 0,
    metadataRevision: store.capture().revision,
    coordinating,
  }));
  const ref = { producerId: 'runtime', epoch: 'one' };
  const producer = createRuntimeMetadataProducer(
    ref,
    prepared({ reactions: [{ id: 'rule', watch: [data('/age')], then: [] }] }),
    'prepared-1',
    {
      definition: { maxRows: 5000, maxVisits: 20000, maxDepth: 64, maxTextBytes: 1000000 },
      topology: { maxNodes: 1000, maxDepth: 64, maxTextBytes: 1000000 },
    },
    capture,
  );
  const gateway = new ObservationGateway(
    {
      leaseMs: 1000,
      snapshotMs: 500,
      maxSessions: 2,
      maxSnapshotBytes: 100000,
      maxEvents: 10,
      maxEventBytes: 10000,
      maxPageSize: 3,
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
  gateway.register(producer, {
    kind: 'runtime',
    label: 'form',
    capabilities: ['metadata', 'values'],
  });
  const request = (command: ObservationCommand) =>
    gateway.hook.request({ ...command, version: 2, requestId: crypto.randomUUID() }).result;
  request({ op: 'discover' });
  expect(capture).not.toHaveBeenCalled();
  coordinating = true;
  expect(request({ op: 'openObservation', producer: ref }).status).toBe('busy');
  coordinating = false;
  const opened = request({ op: 'openObservation', producer: ref });
  if (opened.status !== 'ok' || !('sessionId' in opened)) throw Error('open');
  const target = { producer: ref, sessionId: opened.sessionId };
  store.write('/rows', [{ name: 'replacement' }]);
  const rows: MetadataValue[] = [];
  let cursor: string | undefined;
  do {
    const page = request({
      op: 'readSnapshotPage',
      ...target,
      snapshotId: opened.snapshotId,
      ...(cursor ? { cursor } : {}),
    });
    if (page.status !== 'ok' || !('rows' in page)) throw Error('page');
    expect(page.revision).toBe(0);
    rows.push(...page.rows);
    cursor = page.nextCursor;
  } while (cursor);
  expect(JSON.stringify(rows)).not.toContain('secret');
  expect(rows).toContainEqual(
    expect.objectContaining({
      record: 'header',
      coverage: expect.objectContaining({ instances: 'not-collected' }),
    }),
  );
  expect(rows).toContainEqual(expect.objectContaining({ record: 'relation', kind: 'watches' }));
  expect(
    request({
      op: 'inspectValue',
      ...target,
      expectedVersion: { dataRevision: 0, contextRevision: 0 },
      location: { path: '/name' },
    }).status,
  ).toBe('version-mismatch');
  expect(
    request({
      op: 'inspectValue',
      ...target,
      expectedVersion: { dataRevision: 1, contextRevision: 0 },
      location: { path: '/name' },
    }),
  ).toMatchObject({ status: 'ok', value: 'secret' });
  const limitedRef = { producerId: 'limited', epoch: 'one' };
  gateway.register(
    createRuntimeMetadataProducer(
      limitedRef,
      prepared(),
      'p',
      {
        definition: { maxRows: 1, maxVisits: 100, maxDepth: 10, maxTextBytes: 1000 },
        topology: { maxNodes: 1000, maxDepth: 64, maxTextBytes: 1000000 },
      },
      capture,
    ),
    { kind: 'runtime', label: 'limited', capabilities: ['metadata'] },
  );
  expect(request({ op: 'openObservation', producer: limitedRef }).status).toBe('budget-exceeded');
  gateway.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
