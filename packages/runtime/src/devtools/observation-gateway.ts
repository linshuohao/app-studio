import { ObservationStreams } from './observation-stream.js';
import { ObservationSessions, type ObservationPlatform } from './observation-session.js';
import {
  OBSERVATION_PROTOCOL_VERSION,
  type ObservationRequest,
  type ObservationReply,
  type ObservationResult,
  type ObservationHook,
  type ObservationProducer,
  type ObservationProducerInfo,
  type ObservationLimits,
  type MetadataValue,
  type ObservationEvent,
} from './observation-protocol.js';

function record(input: unknown): Record<string, unknown> | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return;
  const keys = Reflect.ownKeys(input);
  if (keys.length > 12) return;
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    if (typeof key !== 'string') return;
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!descriptor || !('value' in descriptor)) return;
    result[key] = descriptor.value;
  }
  return result;
}
const text = (value: unknown, maximum = 128): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum;
const integer = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const only = (value: Record<string, unknown>, keys: readonly string[]) =>
  Object.keys(value).every((key) => keys.includes(key));
function producerRef(value: unknown) {
  const ref = record(value);
  return !!ref && only(ref, ['producerId', 'epoch']) && text(ref.producerId) && text(ref.epoch);
}
function request(input: Record<string, unknown>): ObservationRequest | undefined {
  if (!text(input.requestId) || typeof input.op !== 'string') return;
  const base = ['version', 'requestId', 'op'];
  if (input.op === 'discover') return only(input, base) ? (input as ObservationRequest) : undefined;
  base.push('producer');
  if (!producerRef(input.producer)) return;
  if (input.op === 'openObservation')
    return only(input, base) ? (input as ObservationRequest) : undefined;
  base.push('sessionId');
  if (!text(input.sessionId)) return;
  let valid = false;
  switch (input.op) {
    case 'readSnapshotPage':
      base.push('snapshotId', 'cursor');
      valid = text(input.snapshotId) && (input.cursor === undefined || text(input.cursor));
      break;
    case 'readMetadataChanges':
      base.push('baseRevision');
      valid = integer(input.baseRevision);
      break;
    case 'readUpdates':
      base.push('cursor');
      valid = text(input.cursor);
      break;
    case 'inspectValue': {
      base.push('expectedVersion', 'location');
      const version = record(input.expectedVersion),
        location = record(input.location);
      valid =
        !!version &&
        only(version, ['dataRevision', 'contextRevision']) &&
        integer(version.dataRevision) &&
        integer(version.contextRevision) &&
        !!location &&
        only(location, ['member', 'path']) &&
        typeof location.path === 'string' &&
        location.path.length <= 4096 &&
        (location.path === '' ||
          (location.path.startsWith('/') && !/~(?:[^01]|$)/.test(location.path))) &&
        (location.member === undefined || text(location.member));
      break;
    }
    case 'locateEvidence': {
      base.push('event');
      const event = record(input.event);
      valid =
        !!event &&
        only(event, ['producerId', 'epoch', 'sequence']) &&
        text(event.producerId) &&
        text(event.epoch) &&
        integer(event.sequence);
      break;
    }
    case 'closeObservation':
      valid = true;
      break;
  }
  return valid && only(input, base) ? (input as ObservationRequest) : undefined;
}
interface Entry {
  readonly info: ObservationProducerInfo;
  readonly sessions: ObservationSessions;
  sequence: number;
  release?: () => void;
  disconnect?: () => void;
}
/** 开发态多生产者路由；只接受声明操作，不暴露业务执行能力。不自行安装全局 Hook。 */
export class ObservationGateway {
  readonly #streams: ObservationStreams;
  readonly #entries = new Map<string, Entry>();
  readonly #limits: ObservationLimits;
  readonly #platform: ObservationPlatform;
  readonly #maxProducers: number;
  #disposed = false;
  readonly hook: ObservationHook;
  constructor(limits: ObservationLimits, platform: ObservationPlatform, maxProducers: number) {
    if (!Number.isSafeInteger(maxProducers) || maxProducers <= 0)
      throw Error('invalid producer budget');
    this.#limits = Object.freeze({ ...limits });
    this.#platform = platform;
    this.#maxProducers = maxProducers;
    this.#streams = new ObservationStreams(this.#limits, platform, () =>
      [...this.#entries.values()].map((e) => e.info),
    );
    this.hook = Object.freeze({
      version: OBSERVATION_PROTOCOL_VERSION,
      request: (input: unknown) => this.#request(input),
      subscribe: (listener: Parameters<ObservationHook['subscribe']>[0]) =>
        this.#streams.subscribe(listener),
    });
  }
  register(producer: ObservationProducer, info: Omit<ObservationProducerInfo, 'ref'>) {
    if (this.#disposed) throw Error('observation disposed');
    if (
      !producerRef(producer.ref) ||
      !text(info.label, 1024) ||
      !['runtime', 'view', 'material'].includes(info.kind) ||
      info.capabilities.some((capability) => !['metadata', 'values', 'events'].includes(capability))
    )
      throw Error('invalid producer');
    if (this.#entries.has(producer.ref.producerId)) throw Error('producer already registered');
    if (this.#entries.size >= this.#maxProducers) throw Error('producer budget exceeded');
    const ref = Object.freeze({ ...producer.ref });
    const entry: Entry = {
      sequence: producer.eventSequence?.() ?? 0,
      info: Object.freeze({
        ...info,
        ref,
        capabilities: Object.freeze([...new Set(info.capabilities)]),
      }),
      sessions: new ObservationSessions(producer, this.#limits, this.#platform),
    };
    this.#entries.set(ref.producerId, entry);
    this.#streams.directoryChanged();
    const dispose = () => {
      if (this.#entries.get(ref.producerId) !== entry) return;
      this.#entries.delete(ref.producerId);
      this.#streams.directoryChanged();
      entry.sessions.dispose();
      try {
        entry.disconnect?.();
      } catch {
        /* 继续撤销释放订阅。 */
      }
      entry.disconnect = undefined;
      const release = entry.release;
      entry.release = undefined;
      release?.();
    };
    try {
      entry.disconnect = producer.connectEvents?.({
        interested: (kind) => this.#streams.interested(kind) || entry.sessions.interested(kind),
        append: (kind, payload, eventRef, time) => {
          entry.sessions.append(kind, payload, eventRef, time);
          this.#streams.append(kind, payload, eventRef, time);
        },
      });
      const release = producer.onDispose?.(dispose);
      if (this.#entries.get(ref.producerId) === entry) entry.release = release;
      else release?.();
    } catch (error) {
      dispose();
      throw error;
    }
    return Object.freeze({
      ref,
      publish: (kind: ObservationEvent['kind'], payload: MetadataValue) => {
        if (this.#entries.get(ref.producerId) === entry) {
          const eventRef = producer.nextEventRef?.() ?? { ...ref, sequence: ++entry.sequence };
          entry.sessions.append(kind, () => payload, eventRef);
          this.#streams.append(kind, () => payload, eventRef);
        }
      },
      dispose,
    });
  }
  #request(input: unknown): ObservationReply {
    let requestId = '';
    const reply = (result: ObservationReply['result']): ObservationReply =>
      Object.freeze({
        version: OBSERVATION_PROTOCOL_VERSION,
        requestId,
        result: Object.freeze(result),
      });
    try {
      const value = record(input);
      if (!value) return reply({ status: 'invalid-request' });
      if (text(value.requestId)) requestId = value.requestId;
      if (value.version !== OBSERVATION_PROTOCOL_VERSION) return reply({ status: 'incompatible' });
      const command = request(value);
      if (!command) return reply({ status: 'invalid-request' });
      if (this.#disposed) return reply({ status: 'disposed' });
      if (command.op === 'discover')
        return reply({
          status: 'ok',
          producers: Object.freeze([...this.#entries.values()].map((entry) => entry.info)),
          limits: this.#limits,
        });
      const entry = this.#entries.get(command.producer.producerId);
      if (!entry || entry.info.ref.epoch !== command.producer.epoch)
        return reply({ status: 'invalid-reference' });
      return reply(this.#route(command, entry));
    } catch {
      return reply({ status: 'unavailable' });
    }
  }
  #route(
    command: Exclude<ObservationRequest, { op: 'discover' }>,
    { info, sessions }: Entry,
  ): ObservationResult {
    const supports = (capability: ObservationProducerInfo['capabilities'][number]) =>
      info.capabilities.includes(capability);
    if (command.op === 'openObservation')
      return supports('metadata')
        ? sessions.openObservation(command.producer)
        : { status: 'unsupported' };
    if (!sessions.hasSession(command.sessionId)) return { status: 'session-expired' };
    switch (command.op) {
      case 'readSnapshotPage':
        return sessions.readSnapshotPage(command.sessionId, command.snapshotId, command.cursor);
      case 'readMetadataChanges':
        return sessions.readMetadataChanges(command.sessionId, command.baseRevision);
      case 'readUpdates':
        return sessions.readUpdates(command.sessionId, command.cursor);
      case 'inspectValue':
        return supports('values')
          ? sessions.inspectValue(command.sessionId, command.expectedVersion, command.location)
          : { status: 'unsupported' };
      case 'locateEvidence':
        return command.event.producerId === info.ref.producerId &&
          command.event.epoch === info.ref.epoch
          ? sessions.locateEvidence(command.sessionId, command.event)
          : { status: 'invalid-reference' };
      case 'closeObservation':
        sessions.closeObservation(command.sessionId);
        return { status: 'closed' };
    }
  }
  dispose() {
    this.#disposed = true;
    this.#streams.dispose();
    for (const entry of this.#entries.values()) {
      entry.sessions.dispose();
      try {
        entry.disconnect?.();
      } catch {
        /* 继续释放生命周期订阅。 */
      }
      try {
        entry.release?.();
      } catch {
        /* 独立释放其余生产者。 */
      }
    }
    this.#entries.clear();
  }
}
