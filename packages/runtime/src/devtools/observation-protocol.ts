/** 新版只读观测协议；独立于 L1 / Prepared，不兼容旧工具接口。 */
export const OBSERVATION_PROTOCOL_VERSION = 2 as const;
export interface ProducerRef {
  readonly producerId: string;
  readonly epoch: string;
}
export interface EntityRef extends ProducerRef {
  readonly entityId: string;
}
export interface EventRef extends ProducerRef {
  readonly sequence: number;
}
export type MetadataValue =
  | null
  | boolean
  | number
  | string
  | readonly MetadataValue[]
  | { readonly [key: string]: MetadataValue };
export interface MetadataSnapshot {
  /** 观测元数据版本，不替代 Data / Context revision。 */
  readonly revision: number;
  readonly rows: readonly MetadataValue[];
}
export type ObservationFailure = {
  readonly status:
    | 'incompatible'
    | 'invalid-reference'
    | 'invalid-cursor'
    | 'session-expired'
    | 'snapshot-expired'
    | 'budget-exceeded'
    | 'disposed'
    | 'busy'
    | 'unsupported'
    | 'unavailable';
};
export interface InputVersion {
  readonly dataRevision: number;
  readonly contextRevision: number;
}
export type ValueResult =
  | ObservationFailure
  | { readonly status: 'version-mismatch'; readonly currentVersion: InputVersion }
  | { readonly status: 'missing'; readonly version: InputVersion }
  | { readonly status: 'ok'; readonly version: InputVersion; readonly value: MetadataValue };
export type EvidenceResult =
  | ObservationFailure
  | {
      readonly status: 'ok';
      readonly event: EventRef;
      readonly availability: 'available' | 'unavailable';
      readonly reason: 'retained-runtime-diagnostic' | 'not-recorded-or-expired';
      /** 指向原 Runtime diagnostics() 的诊断序号；不复制完整输入，不证明 Host 已持久化。 */
      readonly diagnosticSequences: readonly number[];
    };
/** 生产者仅提供已协调的元数据；busy 表示尚无一致切点，不能暴露中间态。 */
export interface ObservationProducer {
  readonly ref: ProducerRef;
  /** 内部资源释放接缝，不是工具事件订阅或业务回调。 */
  onDispose?(release: () => void): () => void;
  /** 仅连接引擎内部有界会话，不接受页面消费者回调。 */
  connectEvents?(sink: ObservationEventSink): () => void;
  locateEvidence?(event: EventRef): EvidenceResult;
  eventSequence?(): number;
  nextEventRef?(): EventRef;
  snapshot(): MetadataSnapshot | { readonly status: 'busy' | 'disposed' };
  revision(): number;
  inputVersion(): InputVersion;
  inspect(location: { readonly member?: string; readonly path: string }): ValueResult;
}
/** 已接线的事实子集；其余排队、动作和异步事件不能由这些事实推断。 */
type ReactionExecution = {
  readonly instance: EntityRef;
  readonly executionId: string;
};
type CommandObservation = {
  readonly commandId: string;
  readonly operation: EventRef | null;
  readonly reactionExecutionId: string | null;
  readonly actionIndex: number | null;
};
export type EligibilityLoss =
  | 'input-invalidated'
  | 'context-replaced'
  | 'source-removed'
  | 'runtime-disposed'
  | 'eligibility-changed';
type ValidationSourceFact = { readonly source: EntityRef; readonly generation: number };
type ValidationWorkFact = ValidationSourceFact & {
  readonly workId: number;
  readonly eligibilityGeneration: number | null;
};
type SourceStateFact = ValidationSourceFact & {
  readonly cause?: EventRef | null;
  readonly status: string;
  readonly reason: string | null;
  readonly issueCount: number;
  readonly workId: number | null;
  readonly inputVersion: InputVersion;
};
export interface ObservationPayloads {
  'renderer.request': {
    readonly origin?: 'not-provided';
    readonly requestId: number;
    readonly name: string;
    readonly status:
      'pending' | 'success' | 'error' | 'discarded' | 'returned' | 'rejected' | 'late-discarded';
    readonly runtime: ProducerRef | null;
    readonly view: ProducerRef | null;
    readonly nodeId: string;
    readonly occurrence: string;
  };
  'source.invalidated': SourceStateFact;
  'source.result-published': SourceStateFact;
  'work.created': ValidationWorkFact & {
    readonly inputVersion: InputVersion;
    readonly causes?: readonly EventRef[];
    readonly causesComplete?: boolean;
  };
  'work.started': ValidationWorkFact & { readonly inputVersion: InputVersion };
  'work.phase': ValidationWorkFact & { readonly phase: 'pending' | 'settling' };
  'work.finished': ValidationWorkFact & { readonly outcome: 'done' | 'cancelled' };
  'work.eligibility-revoked': ValidationWorkFact & { readonly reason: EligibilityLoss };
  'work.cancel-attempted': ValidationWorkFact;
  'work.cancel-returned': ValidationWorkFact & {
    readonly outcome: 'returned' | 'threw' | 'rejected';
    readonly scope: 'cancel-callback';
  };
  'work.returned': ValidationWorkFact & { readonly outcome: 'resolved' | 'rejected' };
  'work.discarded': ValidationWorkFact & {
    readonly reason: EligibilityLoss;
    readonly returned: EventRef | null;
  };
  'call.started': {
    readonly callId: number;
    readonly operation: EventRef | null;
    readonly inputVersion: InputVersion;
  };
  'call.attached-work': ValidationWorkFact & { readonly callId: number; readonly reused: boolean };
  'call.finished': {
    readonly callId: number;
    readonly outcome: 'valid' | 'invalid' | 'incomplete' | 'stale';
    readonly inputVersion: InputVersion;
  };
  'reaction.queue-cancelled': {
    readonly queueEntryId: string;
    readonly reason: 'source-removed' | 'aborted' | 'runtime-disposed';
  };

  'operation.started': {
    readonly source: 'initialize' | 'dispatch' | 'replaceContext' | 'validate';
    readonly inputVersion: InputVersion;
  };
  'operation.returned': {
    readonly operation: EventRef | null;
    readonly scope: 'entry-return';
    readonly ok: boolean;
    readonly changed: boolean;
    readonly inputVersion: InputVersion;
  };
  'reaction.queued': {
    readonly instance: EntityRef;
    readonly queueEntryId: string;
    readonly cause: EventRef | null;
  };
  'reaction.queue-merged': ObservationPayloads['reaction.queued'];
  'action.finished': {
    readonly reactionExecutionId: string;
    readonly actionIndex: number;
    readonly scope: 'synchronous-return';
    readonly diagnostic: 'not-collected';
  } & (
    | {
        readonly kind: 'command' | 'host.emit';
        readonly outcome: 'not-executed';
        readonly reason: 'condition-false' | 'condition-error' | 'interrupted';
      }
    | { readonly kind: 'host.emit'; readonly outcome: 'returned' | 'error' }
    | {
        readonly kind: 'command';
        readonly outcome: 'changed' | 'no-change' | 'error' | 'partial-error' | 'interrupted';
        readonly changed: boolean;
      }
  );
  'command.finished': CommandObservation & {
    readonly outcome: 'changed' | 'no-change' | 'error' | 'partial-error' | 'not-executed';
    readonly diagnostic: 'not-collected';
  };
  'data.changed': CommandObservation & {
    readonly target: { readonly member?: string; readonly path: string };
    readonly path: string;
    readonly before: InputVersion;
    readonly after: InputVersion;
    readonly topologyChanged: boolean;
    readonly detail: 'target-only';
  };

  'entity.added': { readonly entity: EntityRef; readonly row: MetadataValue };
  'entity.disposed': ObservationPayloads['entity.added'];
  diagnostic: MetadataValue;
  'metadata.changed': MetadataValue;
  'reaction.started': ReactionExecution & {
    readonly inputVersion: InputVersion;
    readonly causes: 'queue-events';
    readonly queueEntryId: string;
  };
  'reaction.condition': ReactionExecution &
    (
      | { readonly outcome: 'true' | 'false' | 'absent' }
      | { readonly outcome: 'error'; readonly diagnostic: 'not-collected' }
    );
  'reaction.finished': ReactionExecution & {
    readonly outcome: 'completed' | 'condition-false' | 'condition-error' | 'interrupted';
    /** completed 仅表示执行返回，不证明每个动作成功。 */
    readonly actionCoverage: 'all-declared';
  };
}
export type ObservationEvent = {
  [K in keyof ObservationPayloads]: {
    readonly ref: EventRef;
    readonly monotonicTime?: number;
    readonly kind: K;
    readonly payload: ObservationPayloads[K];
  };
}[keyof ObservationPayloads];
/** 内部可信会话接缝；只做有界 DTO 采集，不能挂载 UI / Host 订阅者。 */
export interface ObservationEventSink {
  interested(kind: ObservationEvent['kind']): boolean;
  append(
    kind: ObservationEvent['kind'],
    payload: () => MetadataValue,
    ref: EventRef,
    monotonicTime?: number,
  ): void;
}
export interface ObservationLimits {
  readonly leaseMs: number;
  readonly snapshotMs: number;
  readonly maxSessions: number;
  readonly maxSnapshotBytes: number;
  readonly maxEvents: number;
  readonly maxEventBytes: number;
  readonly maxPageSize: number;
}
export type OpenObservationResult =
  | ObservationFailure
  | {
      readonly status: 'ok';
      readonly sessionId: string;
      readonly snapshotId: string;
      readonly revision: number;
      readonly cursor: string;
      readonly cut: EventRef;
    };
export type SnapshotPageResult =
  | ObservationFailure
  | {
      readonly status: 'ok';
      readonly revision: number;
      readonly rows: readonly MetadataValue[];
      readonly nextCursor?: string;
    };
export type MetadataChangesResult =
  | ObservationFailure
  | {
      readonly status: 'ok';
      readonly baseRevision: number;
      readonly revision: number;
      readonly cut: EventRef;
      readonly upserts: readonly { readonly key: string; readonly row: MetadataValue }[];
      readonly removed: readonly string[];
      readonly order: readonly string[];
    };
export type UpdatesResult =
  | ObservationFailure
  | {
      readonly status: 'ok';
      readonly events: readonly ObservationEvent[];
      readonly dropped: number;
      readonly nextCursor: string;
    };
/** 当前生产者的实际能力目录；能力支持与协议版本分别表达。 */
export interface ObservationProducerInfo {
  readonly ref: ProducerRef;
  readonly kind: 'runtime' | 'view' | 'material';
  readonly label: string;
  readonly capabilities: readonly ('metadata' | 'values' | 'events')[];
}
type SessionTarget = { readonly producer: ProducerRef; readonly sessionId: string };
export type ObservationCommand =
  | { readonly op: 'discover' }
  | { readonly op: 'openObservation'; readonly producer: ProducerRef }
  | (SessionTarget & {
      readonly op: 'readSnapshotPage';
      readonly snapshotId: string;
      readonly cursor?: string;
    })
  | (SessionTarget & { readonly op: 'readUpdates'; readonly cursor: string })
  | (SessionTarget & { readonly op: 'readMetadataChanges'; readonly baseRevision: number })
  | (SessionTarget & {
      readonly op: 'inspectValue';
      readonly expectedVersion: InputVersion;
      readonly location: { readonly member?: string; readonly path: string };
    })
  | (SessionTarget & { readonly op: 'locateEvidence'; readonly event: EventRef })
  | (SessionTarget & { readonly op: 'closeObservation' });
export type ObservationRequest = ObservationCommand & {
  readonly version: typeof OBSERVATION_PROTOCOL_VERSION;
  readonly requestId: string;
};
export type ObservationResult =
  | EvidenceResult
  | ObservationFailure
  | OpenObservationResult
  | SnapshotPageResult
  | UpdatesResult
  | MetadataChangesResult
  | ValueResult
  | {
      readonly status: 'ok';
      readonly producers: readonly ObservationProducerInfo[];
      readonly limits: ObservationLimits;
    }
  | { readonly status: 'closed' };
export interface ObservationReply {
  readonly version: typeof OBSERVATION_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly result: ObservationResult | { readonly status: 'invalid-request' | 'waiting' };
}
/** 异步批量推送。目录为当前完整目录；事件只覆盖订阅建立后的窗口。 */
export type ObservationPush =
  | {
      readonly kind: 'directory';
      readonly producers: readonly ObservationProducerInfo[];
      readonly limits: ObservationLimits;
    }
  | {
      readonly kind: 'events';
      readonly events: readonly ObservationEvent[];
      readonly dropped: number;
    }
  | {
      readonly kind: 'status';
      readonly status: 'waiting' | 'incompatible' | 'disconnected' | 'unavailable';
    };
export interface ObservationHook {
  readonly version: typeof OBSERVATION_PROTOCOL_VERSION;
  request(input: unknown): ObservationReply;
  subscribe(listener: (push: ObservationPush) => void): () => void;
}
