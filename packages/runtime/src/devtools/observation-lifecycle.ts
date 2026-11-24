import type { DefinitionBudget } from './observation-definition.js';
import type { TopologyBudget } from './observation-topology.js';
import type {
  ObservationProducer,
  ProducerRef,
  ObservationEventSink,
  ObservationPayloads,
  EventRef,
  MetadataValue,
} from './observation-protocol.js';
export interface ObservationReadBudget {
  readonly definition: DefinitionBudget;
  readonly topology: TopologyBudget;
  readonly maxRows: number;
  readonly maxBytes: number;
}
type Factory = (ref: ProducerRef, budget: ObservationReadBudget) => ObservationProducer;
interface Entry {
  readonly ref: ProducerRef;
  readonly owner: WeakRef<object>;
  readonly children: Set<Entry>;
  readonly releases: Set<() => void>;
  readonly sinks: Set<ObservationEventSink>;
  identities?: WeakMap<object, string>;
  entitySequence: number;
  eventSequence: number;
  factory?: Factory;
  parent?: Entry;
  producer?: ObservationProducer;
  source?: ObservationProducer;
  active: boolean;
  closed: boolean;
}
let entries: WeakMap<object, Entry> | undefined;
let sequence = 0;
let namespace: string | undefined;
function ensure(owner: object): Entry {
  entries ??= new WeakMap();
  namespace ??= `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  let entry = entries?.get(owner);
  if (!entry) {
    entry = {
      owner: new WeakRef(owner),
      ref: Object.freeze({ producerId: `${namespace}:${++sequence}`, epoch: String(sequence) }),
      children: new Set(),
      releases: new Set(),
      sinks: new Set(),
      entitySequence: 0,
      eventSequence: 0,
      active: false,
      closed: false,
    };
    entries!.set(owner, entry);
  }
  return entry;
}
function remove(entry: Entry) {
  if (entry.closed) return;
  entry.closed = true;
  entry.active = false;
  const owner = entry.owner.deref();
  if (owner && entries?.get(owner) === entry) entries!.delete(owner);
  for (const release of entry.releases) {
    try {
      release();
    } catch {
      /* 工具清理失败不进入业务错误出口。 */
    }
  }
  entry.releases.clear();
  entry.sinks.clear();
  entry.identities = undefined;
  for (const child of entry.children) remove(child);
  entry.children.clear();
  entry.parent?.children.delete(entry);
  entry.parent = undefined;
  entry.producer = undefined;
  entry.source = undefined;
  entry.factory = undefined;
}
/** 开发接缝目录；没有安装全局 Hook。允许 React 子 effect 先于父 effect 注册。 */
export function registerObservedProducer(
  owner: object,
  factory: Factory,
  parent?: object,
): () => void {
  let entry: Entry | undefined;
  try {
    entry = ensure(owner);
    if (entry.active) return () => {};
    entry.factory = factory;
    entry.active = true;
    if (parent && parent !== owner) {
      const parentEntry = ensure(parent);
      // 内部错误父链不能生成无法清理的环，也不能阻断业务挂载。
      let current: Entry | undefined = parentEntry;
      while (current && current !== entry) current = current.parent;
      if (!current) {
        entry.parent = parentEntry;
        parentEntry.children.add(entry);
      }
    }
    return () => remove(entry!);
  } catch {
    if (entry?.active) remove(entry);
    return () => {};
  }
}
/** 内部接线查询。首次连接固定预算；不是页面发现入口，不对外公开 Runtime 对象。 */
export function getObservedProducer(
  owner: object,
  budget: ObservationReadBudget,
): ObservationProducer | undefined {
  const entry = entries?.get(owner);
  if (!entry?.active) return;
  if (!entry.producer) {
    if (
      !Number.isSafeInteger(budget.maxRows) ||
      budget.maxRows < 1 ||
      !Number.isSafeInteger(budget.maxBytes) ||
      budget.maxBytes < 1
    )
      throw Error('budget');
    const owned = Object.freeze({
      ...budget,
      definition: Object.freeze({ ...budget.definition }),
      topology: Object.freeze({ ...budget.topology }),
    });
    entry.source = entry.factory!(entry.ref, owned);
    entry.producer = Object.freeze({
      ref: entry.ref,
      eventSequence: () => entry.eventSequence,
      nextEventRef: () => Object.freeze({ ...entry.ref, sequence: ++entry.eventSequence }),
      connectEvents: (sink: ObservationEventSink) => {
        if (!entry.active) return () => {};
        entry.sinks.add(sink);
        return () => {
          entry.sinks.delete(sink);
        };
      },
      onDispose: (release: () => void) => {
        if (!entry.active) {
          release();
          return () => {};
        }
        entry.releases.add(release);
        return () => {
          entry.releases.delete(release);
        };
      },
      locateEvidence: (event: EventRef) =>
        entry.active
          ? (entry.source!.locateEvidence?.(event) ?? { status: 'unsupported' as const })
          : { status: 'disposed' as const },
      snapshot: () => (entry.active ? entry.source!.snapshot() : { status: 'disposed' as const }),
      revision: () => {
        if (!entry.active) throw Error('disposed');
        return entry.source!.revision();
      },
      inputVersion: () => {
        if (!entry.active) throw Error('disposed');
        return entry.source!.inputVersion();
      },
      inspect: (location: Parameters<ObservationProducer['inspect']>[0]) =>
        entry.active ? entry.source!.inspect(location) : { status: 'disposed' as const },
    });
  }
  return entry.producer;
}
export function observedChildren(owner: object, maximum: number): readonly ProducerRef[] {
  const entry = entries?.get(owner);
  if (entry && entry.children.size > maximum) throw Error('budget');
  return Object.freeze(
    entry && !entry.closed
      ? [...entry.children].filter((child) => child.active).map((child) => child.ref)
      : [],
  );
}

/** 内部联合测试 / 接线使用，返回生产者接缝而非业务对象。 */
export function observedDescendants(
  owner: object,
  budget: ObservationReadBudget,
): readonly ObservationProducer[] {
  const root = entries?.get(owner);
  const result: ObservationProducer[] = [];
  let visited = 0;
  const visit = (entry: Entry, depth = 0) => {
    if (++visited > budget.maxRows || depth > budget.topology.maxDepth) throw Error('budget');
    for (const child of entry.children) {
      if (result.length >= budget.maxRows) throw Error('budget');
      const childOwner = child.owner.deref();
      const producer = childOwner && getObservedProducer(childOwner, budget);
      if (producer) result.push(producer);
      visit(child, depth + 1);
    }
  };
  if (root && !root.closed) visit(root);
  return Object.freeze(result);
}

export function observedProducerRef(owner: object): ProducerRef | undefined {
  const entry = entries?.get(owner);
  return entry && !entry.closed ? entry.ref : undefined;
}

/** 共用真实对象身份；不以位置键替代实例生命周期。 */
export function observedEntityId(owner: object, object: object): string {
  const entry = entries?.get(owner);
  if (!entry?.active) throw Error('disposed');
  entry.identities ??= new WeakMap();
  let id = entry.identities.get(object);
  if (!id) {
    id = `entity:${++entry.entitySequence}`;
    entry.identities.set(object, id);
  }
  return id;
}
/** 不连接则不构造事实；复制 / 容量失败由会话交付计数保留 gap。 */
export function emitObservedEvent<K extends keyof ObservationPayloads>(
  owner: object,
  kind: K,
  payload: (ref: EventRef) => ObservationPayloads[K],
): EventRef | undefined {
  try {
    const entry = entries?.get(owner);
    if (!entry?.active) return;
    const sinks: ObservationEventSink[] = [];
    for (const sink of entry.sinks) {
      try {
        if (sink.interested(kind)) sinks.push(sink);
      } catch {
        /* 单个连接故障不能吞掉其他连接的事实。 */
      }
    }
    if (!sinks.length) return;
    const ref = Object.freeze({ ...entry.ref, sequence: ++entry.eventSequence });
    const time =
      (globalThis as unknown as { performance?: { now(): number } }).performance?.now() ??
      Date.now();
    // 同一事实在多个 Gateway 中共享身份；延后序列化前由每个会话核固定 DTO。
    let value: ObservationPayloads[K];
    let error: unknown;
    try {
      value = payload(ref);
    } catch (failure) {
      error = failure ?? Error('capture');
    }
    for (const sink of sinks) {
      try {
        sink.append(
          kind,
          () => {
            if (error) throw error;
            return value as MetadataValue;
          },
          ref,
          time,
        );
      } catch {
        /* 独立会话故障不能阻止其他会话和业务执行。 */
      }
    }
    return ref;
  } catch {
    return;
  }
}
