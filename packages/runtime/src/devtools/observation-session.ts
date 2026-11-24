import { metadataDifference } from './observation-metadata.js';
import {
  OBSERVATION_PROTOCOL_VERSION,
  type ProducerRef,
  type InputVersion,
  type ObservationProducer,
  type ObservationLimits,
  type MetadataValue,
  type ObservationEvent,
  type ObservationFailure,
  type OpenObservationResult,
  type SnapshotPageResult,
  type UpdatesResult,
  type ValueResult,
  type EventRef,
  type EvidenceResult,
} from './observation-protocol.js';

const failure = (status: ObservationFailure['status']): ObservationFailure =>
  Object.freeze({ status });
/** 由开发环境适配注入，核心不引入 DOM / Node 依赖。schedule 必须异步调用回调；取消函数必须可重复调用且不抛错。 */
export interface ObservationPlatform {
  now(): number;
  token(): string;
  schedule(callback: () => void, delay: number): () => void;
}
const sameVersion = (a: InputVersion, b: InputVersion) =>
  a.dataRevision === b.dataRevision && a.contextRevision === b.contextRevision;
function utf8Bytes(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** 拒绝 getter / 函数 / 非 JSON 元数据；逐项预算，不能先复制巨大对象再判断超限。 */
export function captureObservationValue(
  value: MetadataValue,
  maximum: number,
): { value: MetadataValue; bytes: number } {
  let bytes = 0,
    nodes = 0;
  const ancestors = new Set<object>();
  const count = (text: string) => {
    // 字符数先行检查，避免对明显过大的字符串进行编码分配。
    if (text.length > maximum - bytes) throw Error('budget');
    bytes += utf8Bytes(text);
    if (bytes > maximum) throw Error('budget');
  };
  const visit = (input: MetadataValue, depth: number): MetadataValue => {
    if (++nodes > maximum || depth > 64) throw Error('budget');
    if (input === null || typeof input === 'boolean') {
      count(String(input));
      return input;
    }
    if (typeof input === 'number') {
      if (!Number.isFinite(input)) throw Error('invalid');
      count(String(input));
      return input;
    }
    if (typeof input === 'string') {
      if (input.length > maximum - bytes) throw Error('budget');
      count(JSON.stringify(input));
      return input;
    }
    if (typeof input !== 'object' || ancestors.has(input)) throw Error('invalid');
    const array = Array.isArray(input);
    if (
      !array &&
      Object.getPrototypeOf(input) !== Object.prototype &&
      Object.getPrototypeOf(input) !== null
    )
      throw Error('invalid');
    ancestors.add(input);
    count(array ? '[]' : '{}');
    const result: Record<string, MetadataValue> = Object.create(null) as Record<
      string,
      MetadataValue
    >;
    const items: MetadataValue[] = [];
    if (array && input.length > maximum - bytes) throw Error('budget');
    const append = (key: string) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) throw Error('invalid');
      if (!array) {
        if (key.length > maximum - bytes) throw Error('budget');
        count(JSON.stringify(key) + ':');
      }
      count(',');
      const child = visit(descriptor.value as MetadataValue, depth + 1);
      if (array) items.push(child);
      else result[key] = child;
    };
    if (array) {
      for (let index = 0; index < input.length; index++) append(String(index));
    } else {
      // 不构造全量键数组；普通内部 DTO 按剩余预算逐项复制。
      for (const key in input) if (Object.hasOwn(input, key)) append(key);
    }
    ancestors.delete(input);
    return Object.freeze(array ? items : result);
  };
  return { value: visit(value, 0), bytes };
}
interface Session {
  readonly id: string;
  readonly snapshotId: string;
  readonly revision: number;
  metadataRows: readonly MetadataValue[];
  metadataRevision: number;
  metadataBusy?: boolean;
  metadataOffer?: {
    rows: readonly MetadataValue[];
    result: Extract<import('./observation-protocol.js').MetadataChangesResult, { status: 'ok' }>;
  };
  rows?: readonly MetadataValue[];
  // 每页至多一个令牌；条目数不超过有界快照行数，随快照释放。
  readonly pageOffsets: Map<string, number>;
  readonly pageTokens: Map<number, string>;
  snapshotTimer: () => void;
  leaseTimer: () => void;
  expires: number;
  snapshotExpires: number;
  events: Array<{ delivery: number; event: ObservationEvent; bytes: number }>;
  eventBytes: number;
  delivered: number;
  acknowledged: number;
  cursor: string;
  offer?: { token: string; through: number };
}
/**
 * 单生产者的工具会话核心。只保存有界 DTO 和租约，不拥有业务任务。
 * 由公开新版 Hook 路由；无双版本兼容 / 旧数据转换逻辑。
 */
export class ObservationSessions {
  readonly #producer: ObservationProducer;
  readonly #ref: ProducerRef;
  readonly #limits: ObservationLimits;
  readonly #sessions = new Map<string, Session>();
  readonly #platform: ObservationPlatform;
  #opening = false;
  #sequence = 0;
  #disposed = false;
  constructor(
    producer: ObservationProducer,
    limits: ObservationLimits,
    platform: ObservationPlatform,
  ) {
    const names: readonly (keyof ObservationLimits)[] = [
      'leaseMs',
      'snapshotMs',
      'maxSessions',
      'maxSnapshotBytes',
      'maxEvents',
      'maxEventBytes',
      'maxPageSize',
    ];
    if (
      names.some(
        (key) =>
          !Number.isSafeInteger(limits[key]) || limits[key] <= 0 || limits[key] > 2_147_483_647,
      )
    )
      throw Error('observation: limits must be positive safe integers');
    this.#platform = platform;
    this.#producer = producer;
    this.#ref = Object.freeze({ ...producer.ref });
    this.#limits = Object.freeze({ ...limits });
  }
  discover(version: number) {
    if (this.#disposed) return failure('disposed');
    if (version !== OBSERVATION_PROTOCOL_VERSION) return failure('incompatible');
    return Object.freeze({
      status: 'ok' as const,
      version: OBSERVATION_PROTOCOL_VERSION,
      producer: this.#ref,
    });
  }
  #boundary() {
    return Object.freeze({
      ...this.#ref,
      sequence: this.#producer.eventSequence?.() ?? this.#sequence,
    });
  }
  #drop(id: string) {
    const session = this.#sessions.get(id);
    if (!session) return;
    try {
      session.leaseTimer();
    } catch {
      /* 继续释放其余资源。 */
    }
    try {
      session.snapshotTimer();
    } catch {
      /* 已撤销的会话不再交付。 */
    }
    session.rows = undefined;
    session.metadataRows = [];
    session.metadataOffer = undefined;
    session.pageOffsets.clear();
    session.pageTokens.clear();
    session.events = [];
    this.#sessions.delete(id);
  }
  #get(id: string): Session | undefined {
    const session = this.#sessions.get(id);
    if (!session) return;
    if (this.#platform.now() >= session.expires) {
      this.#drop(id);
      return;
    }
    return session;
  }
  #touch(session: Session): boolean {
    try {
      const expires = this.#platform.now() + this.#limits.leaseMs;
      const cancel = this.#platform.schedule(() => this.#drop(session.id), this.#limits.leaseMs);
      session.leaseTimer();
      session.expires = expires;
      session.leaseTimer = cancel;
      return true;
    } catch {
      // 先申请新定时器再释放旧租约；失败不能丢失自动释放能力。
      return false;
    }
  }
  openObservation(ref: ProducerRef): OpenObservationResult {
    if (this.#disposed) return failure('disposed');
    if (!ref || ref.producerId !== this.#ref.producerId || ref.epoch !== this.#ref.epoch)
      return failure('invalid-reference');
    for (const id of this.#sessions.keys()) this.#get(id);
    if (this.#sessions.size >= this.#limits.maxSessions) return failure('budget-exceeded');
    if (this.#opening) return failure('busy');
    this.#opening = true;
    let cancelSnapshot: (() => void) | undefined;
    let cancelLease: (() => void) | undefined;
    try {
      const beforeSequence = this.#boundary().sequence;
      const snapshot = this.#producer.snapshot();
      if ('status' in snapshot) return failure(snapshot.status);
      if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0)
        return failure('unavailable');
      const rows = captureObservationValue(snapshot.rows, this.#limits.maxSnapshotBytes)
        .value as readonly MetadataValue[];
      const cut = this.#boundary();
      // 生产者回调不应重入修改；发现切点失效则重试，不能提交混合快照。
      if (
        this.#producer.revision() !== snapshot.revision ||
        this.#boundary().sequence !== beforeSequence ||
        this.#disposed
      )
        return failure('busy');
      const id = this.#platform.token(),
        snapshotId = this.#platform.token(),
        cursor = this.#platform.token();
      const session: Session = {
        id,
        snapshotId,
        revision: snapshot.revision,
        rows,
        metadataRows: rows,
        metadataRevision: snapshot.revision,
        pageOffsets: new Map(),
        pageTokens: new Map(),
        snapshotTimer: () => {},
        leaseTimer: () => {},
        expires: this.#platform.now() + this.#limits.leaseMs,
        snapshotExpires: this.#platform.now() + this.#limits.snapshotMs,
        events: [],
        eventBytes: 0,
        delivered: 0,
        acknowledged: 0,
        cursor,
      };
      cancelSnapshot = this.#platform.schedule(() => {
        session.rows = undefined;
        session.pageOffsets.clear();
        session.pageTokens.clear();
      }, this.#limits.snapshotMs);
      cancelLease = this.#platform.schedule(() => this.#drop(id), this.#limits.leaseMs);
      session.snapshotTimer = cancelSnapshot;
      session.leaseTimer = cancelLease;
      this.#sessions.set(id, session);
      return Object.freeze({
        status: 'ok',
        sessionId: id,
        snapshotId,
        revision: snapshot.revision,
        cursor,
        cut,
      });
    } catch (error) {
      cancelSnapshot?.();
      cancelLease?.();
      return failure(
        error instanceof Error && error.message === 'budget' ? 'budget-exceeded' : 'unavailable',
      );
    } finally {
      this.#opening = false;
    }
  }
  readSnapshotPage(id: string, snapshotId: string, cursor?: string): SnapshotPageResult {
    const session = this.#get(id);
    if (!session) return failure(this.#disposed ? 'disposed' : 'session-expired');
    if (snapshotId !== session.snapshotId) return failure('invalid-reference');
    if (!session.rows || this.#platform.now() >= session.snapshotExpires)
      return failure('snapshot-expired');
    let offset = 0;
    if (cursor !== undefined) {
      const pageOffset = session.pageOffsets.get(cursor);
      if (pageOffset === undefined) return failure('invalid-cursor');
      offset = pageOffset;
    }
    const end = Math.min(offset + this.#limits.maxPageSize, session.rows.length);
    let nextCursor: string | undefined;
    if (end < session.rows.length) {
      nextCursor = session.pageTokens.get(end);
      if (!nextCursor) {
        nextCursor = this.#platform.token();
        session.pageTokens.set(end, nextCursor);
        session.pageOffsets.set(nextCursor, end);
      }
    }
    if (!this.#touch(session)) return failure('unavailable');
    return Object.freeze({
      status: 'ok',
      revision: session.revision,
      rows: Object.freeze(session.rows.slice(offset, end)),
      ...(nextCursor ? { nextCursor } : {}),
    });
  }
  inspectValue(
    id: string,
    expectedVersion: InputVersion,
    location: { member?: string; path: string },
  ): ValueResult {
    const session = this.#get(id);
    if (!session) return failure(this.#disposed ? 'disposed' : 'session-expired');
    if (
      !location ||
      typeof location.path !== 'string' ||
      (location.member !== undefined && typeof location.member !== 'string')
    )
      return failure('invalid-reference');
    const inactive = () => this.#disposed || this.#get(id) !== session;
    const expired = () => failure(this.#disposed ? 'disposed' : 'session-expired');
    try {
      const version = Object.freeze({ ...this.#producer.inputVersion() });
      if (inactive()) return expired();
      if (!expectedVersion || !sameVersion(version, expectedVersion))
        return Object.freeze({ status: 'version-mismatch', currentVersion: version });
      const result = this.#producer.inspect(Object.freeze({ ...location }));
      if (inactive()) return expired();
      if ('version' in result && !sameVersion(result.version, version)) return failure('busy');
      const response: ValueResult =
        result.status === 'ok'
          ? Object.freeze({
              status: 'ok',
              version,
              value: captureObservationValue(result.value, this.#limits.maxSnapshotBytes).value,
            })
          : result.status === 'missing'
            ? Object.freeze({ status: 'missing', version })
            : result.status === 'version-mismatch'
              ? Object.freeze({
                  status: 'version-mismatch',
                  currentVersion: Object.freeze({ ...result.currentVersion }),
                })
              : failure(result.status);
      const after = this.#producer.inputVersion();
      if (inactive()) return expired();
      if (!sameVersion(after, version)) return failure('busy');
      if (!this.#touch(session)) return failure('unavailable');
      return response;
    } catch (error) {
      return inactive()
        ? expired()
        : failure(
            error instanceof Error && error.message === 'budget'
              ? 'budget-exceeded'
              : 'unavailable',
          );
    }
  }

  locateEvidence(id: string, event: EventRef): EvidenceResult {
    const session = this.#get(id);
    if (!session) return failure(this.#disposed ? 'disposed' : 'session-expired');
    if (
      event.producerId !== this.#producer.ref.producerId ||
      event.epoch !== this.#producer.ref.epoch
    )
      return failure('invalid-reference');
    try {
      const result = this.#producer.locateEvidence?.(event) ?? failure('unsupported');
      if (this.#get(id) !== session)
        return failure(this.#disposed ? 'disposed' : 'session-expired');
      const captured = captureObservationValue(
        result as unknown as MetadataValue,
        this.#limits.maxEventBytes,
      ).value as unknown as EvidenceResult;
      if (!this.#touch(session)) return failure('unavailable');
      return captured;
    } catch (error) {
      return failure(
        error instanceof Error && error.message === 'budget' ? 'budget-exceeded' : 'unavailable',
      );
    }
  }
  /** 输入为引擎提供的最小元数据；不接收业务对象或消费者回调。所有采集失败隔离。 */
  interested(_kind: ObservationEvent['kind']): boolean {
    if (this.#disposed) return false;
    try {
      for (const session of this.#sessions.values()) {
        if (this.#get(session.id)) return true;
      }
      return false;
    } catch {
      // 无法判断租约时撤销会话，不能恢复后把漏采窗口冒充连续记录。
      this.dispose();
      return false;
    }
  }
  publish(kind: ObservationEvent['kind'], payload: MetadataValue): void {
    this.append(kind, () => payload);
  }
  append(
    kind: ObservationEvent['kind'],
    payload: () => MetadataValue,
    reference?: import('./observation-protocol.js').EventRef,
    monotonicTime = (
      globalThis as unknown as { performance?: { now(): number } }
    ).performance?.now() ?? Date.now(),
  ): void {
    if (this.#disposed) return;
    try {
      const interested = [...this.#sessions.values()].filter((s) => this.#get(s.id));
      if (!interested.length) return;
      const sequence =
        reference?.sequence ?? this.#producer.nextEventRef?.().sequence ?? ++this.#sequence;
      let retained: { event: ObservationEvent; bytes: number } | undefined;
      try {
        const data = captureObservationValue(payload(), this.#limits.maxEventBytes);
        const event = Object.freeze({
          ref: Object.freeze({ ...this.#ref, sequence }),
          kind,
          monotonicTime,
          payload: data.value,
        }) as ObservationEvent;
        const bytes = utf8Bytes(JSON.stringify(event));
        if (bytes <= this.#limits.maxEventBytes) retained = { event, bytes };
      } catch {
        /* 缺口由交付序号体现，不静默删除事实。 */
      }
      for (const session of interested) {
        const delivery = ++session.delivered;
        if (retained) {
          session.events.push({ delivery, ...retained });
          session.eventBytes += retained.bytes;
        }
        while (
          session.events.length > this.#limits.maxEvents ||
          session.eventBytes > this.#limits.maxEventBytes
        ) {
          session.eventBytes -= session.events.shift()!.bytes;
        }
      }
    } catch {
      /* 平台故障不能在恢复后呈现静默缺口，也不可进入业务路径。 */
      this.dispose();
    }
  }
  readMetadataChanges(
    id: string,
    baseRevision: number,
  ): import('./observation-protocol.js').MetadataChangesResult {
    const session = this.#get(id);
    if (!session) return failure(this.#disposed ? 'disposed' : 'session-expired');
    if (session.metadataBusy) return failure('busy');
    if (session.metadataOffer) {
      const offer = session.metadataOffer;
      if (baseRevision === offer.result.baseRevision) {
        if (!this.#touch(session)) return failure('unavailable');
        return offer.result;
      }
      if (baseRevision !== offer.result.revision) return failure('invalid-cursor');
      session.metadataRows = offer.rows;
      session.metadataRevision = offer.result.revision;
      session.metadataOffer = undefined;
    }
    if (baseRevision !== session.metadataRevision) return failure('invalid-cursor');
    session.metadataBusy = true;
    try {
      const before = this.#boundary().sequence;
      const snapshot = this.#producer.snapshot();
      if ('status' in snapshot) return failure(snapshot.status);
      const rows = captureObservationValue(snapshot.rows, this.#limits.maxSnapshotBytes)
        .value as readonly MetadataValue[];
      if (this.#producer.revision() !== snapshot.revision || before !== this.#boundary().sequence)
        return failure('busy');
      if (this.#get(id) !== session)
        return failure(this.#disposed ? 'disposed' : 'session-expired');
      if (snapshot.revision < baseRevision) return failure('unavailable');
      const result = captureObservationValue(
        {
          status: 'ok',
          baseRevision,
          revision: snapshot.revision,
          cut: this.#boundary(),
          ...metadataDifference(session.metadataRows, rows),
        },
        this.#limits.maxSnapshotBytes,
      ).value as unknown as Extract<
        import('./observation-protocol.js').MetadataChangesResult,
        { status: 'ok' }
      >;
      if (!this.#touch(session)) return failure('unavailable');
      if (snapshot.revision !== baseRevision) session.metadataOffer = { rows, result };
      return result;
    } catch (error) {
      return failure(
        error instanceof Error && error.message === 'budget' ? 'budget-exceeded' : 'unavailable',
      );
    } finally {
      session.metadataBusy = false;
    }
  }
  readUpdates(id: string, cursor: string): UpdatesResult {
    const session = this.#get(id);
    if (!session) return failure(this.#disposed ? 'disposed' : 'session-expired');
    if (cursor !== session.cursor) {
      if (!session.offer || cursor !== session.offer.token) return failure('invalid-cursor');
      session.acknowledged = session.offer.through;
      session.cursor = cursor;
      session.offer = undefined;
      while (session.events[0] && session.events[0].delivery <= session.acknowledged)
        session.eventBytes -= session.events.shift()!.bytes;
    }
    const events = session.events.filter((e) => e.delivery > session.acknowledged);
    // 回复重试期间新事件可加入，但已提供的令牌仍只确认原批次边界，不能越过未交付事实。
    session.offer ??= { token: this.#platform.token(), through: session.delivered };
    const through = session.offer.through;
    const batch = events.filter((e) => e.delivery <= through);
    if (!this.#touch(session)) return failure('unavailable');
    return Object.freeze({
      status: 'ok',
      events: Object.freeze(batch.map((e) => e.event)),
      dropped: through - session.acknowledged - batch.length,
      nextCursor: session.offer.token,
    });
  }
  /** 仅供内部路由核对所有权；不读取生产者，也不延长租期。 */
  hasSession(id: string): boolean {
    return !this.#disposed && this.#get(id) !== undefined;
  }
  closeObservation(id: string) {
    this.#drop(id);
  }
  dispose() {
    this.#disposed = true;
    for (const id of this.#sessions.keys()) this.#drop(id);
  }
}
