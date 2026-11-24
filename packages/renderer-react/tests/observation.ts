import type {
  ObservationHook,
  ProducerRef,
  MetadataValue,
  ObservationCommand,
} from '@form-engine/runtime/devtools';
export const request = (hook: ObservationHook, command: ObservationCommand) =>
  hook.request({ ...command, version: 2, requestId: crypto.randomUUID() }).result;
export function listProducers(hook: ObservationHook) {
  const result = request(hook, { op: 'discover' });
  if (result.status !== 'ok' || !('producers' in result)) throw Error('discover');
  return result.producers;
}
export function openSession(hook: ObservationHook, producer: ProducerRef) {
  const result = request(hook, { op: 'openObservation', producer });
  if (result.status !== 'ok' || !('sessionId' in result)) throw Error('open');
  return result;
}
export function readMetadata(hook: ObservationHook, producer: ProducerRef) {
  const open = openSession(hook, producer),
    rows: MetadataValue[] = [];
  let cursor: string | undefined;
  try {
    do {
      const page = request(hook, {
        op: 'readSnapshotPage',
        producer,
        sessionId: open.sessionId,
        snapshotId: open.snapshotId,
        ...(cursor ? { cursor } : {}),
      });
      if (page.status !== 'ok' || !('rows' in page)) throw Error('page');
      rows.push(...page.rows);
      cursor = page.nextCursor;
    } while (cursor);
    return rows;
  } finally {
    request(hook, { op: 'closeObservation', producer, sessionId: open.sessionId });
  }
}
