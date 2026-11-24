import type { ObservationRequest } from '@form-engine/runtime/devtools';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const text = (value: unknown) => typeof value === 'string' && value.length > 0;
const version = (value: unknown) =>
  object(value) && integer(value.dataRevision) && integer(value.contextRevision);
const ref = (value: unknown) => object(value) && text(value.producerId) && text(value.epoch);
const eventRef = (value: unknown) => ref(value) && object(value) && integer(value.sequence);
function metadata(value: unknown, depth = 0, ancestors = new Set<unknown>()): boolean {
  if (depth > 64) return false;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    return false;
  ancestors.add(value);
  let valid = true;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    if (!metadata(child, depth + 1, ancestors)) {
      valid = false;
      break;
    }
  }
  ancestors.delete(value);
  return valid;
}
/** 只有完整判别字段才可进入 typed Store；错误不能伪装成正常条件结果。 */
function eventPayload(event: Record<string, unknown>): boolean {
  if (
    event.monotonicTime !== undefined &&
    (typeof event.monotonicTime !== 'number' || !Number.isFinite(event.monotonicTime))
  )
    return false;
  const payload = event.payload;
  if (!metadata(payload)) return false;
  if (event.kind === 'diagnostic' || event.kind === 'metadata.changed') return true;
  if (!object(payload) || !object(event.ref)) return false;
  const localRef = (value: unknown) =>
    eventRef(value) &&
    object(value) &&
    object(event.ref) &&
    value.producerId === event.ref.producerId &&
    value.epoch === event.ref.epoch;
  const optionalRef = (value: unknown) => value === null || localRef(value);
  const location = (value: unknown) =>
    object(value) &&
    typeof value.path === 'string' &&
    (value.path === '' || (value.path.startsWith('/') && !/~(?:[^01]|$)/.test(value.path))) &&
    (value.member === undefined || text(value.member));
  const sourceFact = () =>
    object(payload.source) &&
    ref(payload.source) &&
    text(payload.source.entityId) &&
    object(event.ref) &&
    payload.source.producerId === event.ref.producerId &&
    payload.source.epoch === event.ref.epoch &&
    integer(payload.generation);
  if (event.kind === 'reaction.queue-cancelled')
    return (
      text(payload.queueEntryId) &&
      ['source-removed', 'aborted', 'runtime-disposed'].includes(payload.reason as string)
    );
  if (event.kind === 'source.invalidated' || event.kind === 'source.result-published')
    return (
      sourceFact() &&
      [
        'unverified',
        'pending',
        'valid',
        'invalid',
        'incomplete',
        'blocked',
        'not-applicable',
      ].includes(payload.status as string) &&
      (payload.reason === null || text(payload.reason)) &&
      integer(payload.issueCount) &&
      (payload.workId === null || integer(payload.workId)) &&
      version(payload.inputVersion)
    );
  if (typeof event.kind === 'string' && event.kind.startsWith('work.')) {
    if (
      !sourceFact() ||
      !integer(payload.workId) ||
      !(payload.eligibilityGeneration === null || integer(payload.eligibilityGeneration))
    )
      return false;
    switch (event.kind) {
      case 'work.created':
      case 'work.started':
        return version(payload.inputVersion);
      case 'work.phase':
        return ['pending', 'settling'].includes(payload.phase as string);
      case 'work.finished':
        return ['done', 'cancelled'].includes(payload.outcome as string);
      case 'work.eligibility-revoked':
        return [
          'input-invalidated',
          'context-replaced',
          'source-removed',
          'runtime-disposed',
          'eligibility-changed',
        ].includes(payload.reason as string);
      case 'work.cancel-attempted':
        return true;
      case 'work.cancel-returned':
        return (
          ['returned', 'threw', 'rejected'].includes(payload.outcome as string) &&
          payload.scope === 'cancel-callback'
        );
      case 'work.returned':
        return ['resolved', 'rejected'].includes(payload.outcome as string);
      case 'work.discarded':
        return (
          [
            'input-invalidated',
            'context-replaced',
            'source-removed',
            'runtime-disposed',
            'eligibility-changed',
          ].includes(payload.reason as string) && optionalRef(payload.returned)
        );
      default:
        return false;
    }
  }
  if (event.kind === 'call.started')
    return (
      integer(payload.callId) && optionalRef(payload.operation) && version(payload.inputVersion)
    );
  if (event.kind === 'call.attached-work')
    return (
      sourceFact() &&
      integer(payload.callId) &&
      integer(payload.workId) &&
      (payload.eligibilityGeneration === null || integer(payload.eligibilityGeneration)) &&
      typeof payload.reused === 'boolean'
    );
  if (event.kind === 'call.finished')
    return (
      integer(payload.callId) &&
      version(payload.inputVersion) &&
      ['valid', 'invalid', 'incomplete', 'stale'].includes(payload.outcome as string)
    );
  switch (event.kind) {
    case 'entity.added':
    case 'entity.disposed':
      return (
        object(payload.entity) &&
        ref(payload.entity) &&
        text(payload.entity.entityId) &&
        metadata(payload.row)
      );
    case 'renderer.request':
      return (
        integer(payload.requestId) &&
        text(payload.name) &&
        text(payload.nodeId) &&
        text(payload.occurrence) &&
        [
          'pending',
          'success',
          'error',
          'discarded',
          'returned',
          'rejected',
          'late-discarded',
        ].includes(String(payload.status)) &&
        (payload.runtime === null || ref(payload.runtime)) &&
        (payload.view === null || ref(payload.view))
      );
    case 'operation.started':
      return (
        ['initialize', 'dispatch', 'replaceContext', 'validate'].includes(
          payload.source as string,
        ) && version(payload.inputVersion)
      );
    case 'operation.returned':
      return (
        optionalRef(payload.operation) &&
        payload.scope === 'entry-return' &&
        typeof payload.ok === 'boolean' &&
        typeof payload.changed === 'boolean' &&
        version(payload.inputVersion)
      );
    case 'action.finished':
      return (
        text(payload.reactionExecutionId) &&
        integer(payload.actionIndex) &&
        payload.scope === 'synchronous-return' &&
        payload.diagnostic === 'not-collected' &&
        (payload.outcome === 'not-executed'
          ? ['command', 'host.emit'].includes(String(payload.kind)) &&
            ['condition-false', 'condition-error', 'interrupted'].includes(String(payload.reason))
          : payload.kind === 'host.emit'
            ? ['returned', 'error'].includes(payload.outcome as string)
            : payload.kind === 'command' &&
              typeof payload.changed === 'boolean' &&
              (payload.outcome === 'interrupted' ||
                (payload.changed ? ['changed', 'partial-error'] : ['no-change', 'error']).includes(
                  payload.outcome as string,
                )))
      );
    case 'command.finished':
    case 'data.changed': {
      if (
        !text(payload.commandId) ||
        !optionalRef(payload.operation) ||
        !(payload.reactionExecutionId === null || text(payload.reactionExecutionId)) ||
        !(payload.actionIndex === null || integer(payload.actionIndex))
      )
        return false;
      return event.kind === 'command.finished'
        ? ['changed', 'no-change', 'error', 'partial-error', 'not-executed'].includes(
            payload.outcome as string,
          ) && payload.diagnostic === 'not-collected'
        : location(payload.target) &&
            typeof payload.path === 'string' &&
            location({ path: payload.path }) &&
            version(payload.before) &&
            version(payload.after) &&
            typeof payload.topologyChanged === 'boolean' &&
            payload.detail === 'target-only';
    }
  }
  if (event.kind === 'reaction.queued' || event.kind === 'reaction.queue-merged')
    return (
      object(payload.instance) &&
      ref(payload.instance) &&
      text(payload.instance.entityId) &&
      payload.instance.producerId === event.ref.producerId &&
      payload.instance.epoch === event.ref.epoch &&
      text(payload.queueEntryId) &&
      optionalRef(payload.cause)
    );

  if (
    !object(payload) ||
    !object(payload.instance) ||
    !ref(payload.instance) ||
    !text(payload.instance.entityId) ||
    !text(payload.executionId) ||
    !object(event.ref) ||
    payload.instance.producerId !== event.ref.producerId ||
    payload.instance.epoch !== event.ref.epoch
  )
    return false;
  switch (event.kind) {
    case 'reaction.started':
      return (
        version(payload.inputVersion) &&
        payload.causes === 'queue-events' &&
        text(payload.queueEntryId)
      );
    case 'reaction.condition':
      return (
        ['true', 'false', 'absent'].includes(payload.outcome as string) ||
        (payload.outcome === 'error' && payload.diagnostic === 'not-collected')
      );
    case 'reaction.finished':
      return (
        ['completed', 'condition-false', 'condition-error', 'interrupted'].includes(
          payload.outcome as string,
        ) && payload.actionCoverage === 'all-declared'
      );
    default:
      return false;
  }
}
/** 响应尚未进入 Store，先验证判别及对应操作必需结构；无效响应不包装成可信 DTO。 */
export function validObservationResult(command: ObservationRequest, value: unknown): boolean {
  if (!object(value)) return false;
  const expectedInput = (input: unknown) =>
    object(input) &&
    command.op === 'inspectValue' &&
    input.dataRevision === command.expectedVersion.dataRevision &&
    input.contextRevision === command.expectedVersion.contextRevision;
  const scoped = (reference: unknown) =>
    object(reference) &&
    'producer' in command &&
    reference.producerId === command.producer.producerId &&
    reference.epoch === command.producer.epoch;
  if (
    [
      'incompatible',
      'invalid-reference',
      'invalid-cursor',
      'session-expired',
      'snapshot-expired',
      'budget-exceeded',
      'disposed',
      'busy',
      'unsupported',
      'unavailable',
      'invalid-request',
      'waiting',
    ].includes(value.status as string)
  )
    return true;
  if (value.status === 'closed') return command.op === 'closeObservation';
  if (value.status === 'version-mismatch')
    return command.op === 'inspectValue' && version(value.currentVersion);
  if (value.status === 'missing')
    return command.op === 'inspectValue' && version(value.version) && expectedInput(value.version);
  if (value.status !== 'ok') return false;
  switch (command.op) {
    case 'discover':
      return (
        Array.isArray(value.producers) &&
        value.producers.every(
          (producer) =>
            object(producer) &&
            ref(producer.ref) &&
            text(producer.label) &&
            ['runtime', 'view', 'material'].includes(producer.kind as string) &&
            Array.isArray(producer.capabilities) &&
            producer.capabilities.every((capability) =>
              ['metadata', 'values', 'events'].includes(capability),
            ),
        ) &&
        object(value.limits) &&
        [
          'leaseMs',
          'snapshotMs',
          'maxSessions',
          'maxSnapshotBytes',
          'maxEvents',
          'maxEventBytes',
          'maxPageSize',
        ].every(
          (key) =>
            object(value.limits) && integer(value.limits[key]) && (value.limits[key] as number) > 0,
        )
      );
    case 'openObservation':
      return (
        text(value.sessionId) &&
        text(value.snapshotId) &&
        text(value.cursor) &&
        integer(value.revision) &&
        eventRef(value.cut) &&
        scoped(value.cut)
      );
    case 'readSnapshotPage':
      return (
        integer(value.revision) &&
        Array.isArray(value.rows) &&
        metadata(value.rows) &&
        (value.nextCursor === undefined || text(value.nextCursor))
      );
    case 'readMetadataChanges':
      return (
        value.baseRevision === command.baseRevision &&
        integer(value.revision) &&
        (value.revision as number) >= command.baseRevision &&
        eventRef(value.cut) &&
        scoped(value.cut) &&
        Array.isArray(value.upserts) &&
        value.upserts.every((item) => object(item) && text(item.key) && metadata(item.row)) &&
        Array.isArray(value.removed) &&
        value.removed.every(text) &&
        Array.isArray(value.order) &&
        value.order.every(text) &&
        new Set(value.order).size === value.order.length
      );
    case 'readUpdates':
      return (
        integer(value.dropped) &&
        text(value.nextCursor) &&
        Array.isArray(value.events) &&
        value.events.every(
          (event) =>
            object(event) && eventRef(event.ref) && scoped(event.ref) && eventPayload(event),
        )
      );
    case 'inspectValue':
      return version(value.version) && expectedInput(value.version) && metadata(value.value);
    case 'locateEvidence':
      return (
        eventRef(value.event) &&
        scoped(value.event) &&
        object(value.event) &&
        value.event.sequence === command.event.sequence &&
        Array.isArray(value.diagnosticSequences) &&
        value.diagnosticSequences.every(integer) &&
        (value.availability === 'available'
          ? value.reason === 'retained-runtime-diagnostic' && value.diagnosticSequences.length > 0
          : value.availability === 'unavailable' &&
            value.reason === 'not-recorded-or-expired' &&
            value.diagnosticSequences.length === 0)
      );
    default:
      return false;
  }
}

export function validObservationPush(value: unknown): boolean {
  if (!object(value)) return false;
  if (value.kind === 'status')
    return ['waiting', 'incompatible', 'disconnected', 'unavailable'].includes(
      String(value.status),
    );
  if (value.kind === 'directory')
    return validObservationResult(
      { version: 2, requestId: 'push', op: 'discover' },
      { ...value, status: 'ok' },
    );
  return (
    value.kind === 'events' &&
    integer(value.dropped) &&
    Array.isArray(value.events) &&
    value.events.length <= 10000 &&
    value.events.every((event) => object(event) && eventRef(event.ref) && eventPayload(event))
  );
}
