import * as lifecycle from './observation-lifecycle.js';
import { ObservationGateway } from './observation-gateway.js';
import type {
  ObservationHook,
  ObservationProducerInfo,
  ObservationPayloads,
  EventRef,
} from './observation-protocol.js';
export type * from './observation-protocol.js';
export type { ObservationReadBudget } from './observation-lifecycle.js';
export { createMetadataReader } from './observation-reader.js';
declare const __FORM_ENGINE_DEVTOOLS_ENABLED__: boolean;
export const DEVTOOLS_ENABLED =
  typeof __FORM_ENGINE_DEVTOOLS_ENABLED__ === 'undefined' || __FORM_ENGINE_DEVTOOLS_ENABLED__;
const KEY = '__FORM_ENGINE_DEVTOOLS__';
const REGISTER = Symbol.for('form-engine.devtools.register.2');
const DIRECTORY = Symbol.for('form-engine.devtools.directory.2');
/** 开发态初始资源上限；作为可测量实现配置，不是业务协议或生产性能承诺。 */
const budget: lifecycle.ObservationReadBudget = {
  definition: { maxRows: 20000, maxVisits: 200000, maxDepth: 64, maxTextBytes: 4000000 },
  topology: { maxNodes: 20000, maxDepth: 64, maxTextBytes: 4000000 },
  maxRows: 20000,
  maxBytes: 8000000,
};
type InternalHook = ObservationHook & {
  [REGISTER]: ObservationGateway['register'];
  [DIRECTORY]: typeof lifecycle;
};
export function getDevtoolsHook(): ObservationHook | undefined {
  try {
    const hook = (globalThis as Record<string, unknown>)[KEY] as ObservationHook | undefined;
    return hook?.version === 2 &&
      typeof hook.request === 'function' &&
      typeof hook.subscribe === 'function'
      ? hook
      : undefined;
  } catch {
    return;
  }
}
function directory(): typeof lifecycle {
  return (getDevtoolsHook() as InternalHook | undefined)?.[DIRECTORY] ?? lifecycle;
}
function ensureHook(): InternalHook | undefined {
  const existing = getDevtoolsHook() as InternalHook | undefined;
  if (existing) return existing;
  if (Object.hasOwn(globalThis, KEY)) return;
  const platform = globalThis as unknown as {
    crypto: { randomUUID(): string };
    setTimeout(callback: () => void, delay: number): unknown;
    clearTimeout(timer: unknown): void;
  };
  const gateway = new ObservationGateway(
    {
      leaseMs: 30000,
      snapshotMs: 15000,
      maxSessions: 8,
      maxSnapshotBytes: 8000000,
      maxEvents: 10000,
      maxEventBytes: 8000000,
      maxPageSize: 200,
    },
    {
      now: () => Date.now(),
      token: () => platform.crypto.randomUUID(),
      schedule(callback, delay) {
        const timer = platform.setTimeout(callback, delay);
        return () => platform.clearTimeout(timer);
      },
    },
    2000,
  );
  const hook = Object.freeze({
    ...gateway.hook,
    [REGISTER]: gateway.register.bind(gateway),
    [DIRECTORY]: lifecycle,
  });
  Object.defineProperty(globalThis, KEY, { value: hook, configurable: true });
  // 工具可能先于 Runtime 装载；一次性就绪通知替代发现轮询。
  const events = globalThis as unknown as {
    dispatchEvent?: (event: unknown) => void;
    Event?: new (name: string) => unknown;
  };
  if (events.Event) events.dispatchEvent?.(new events.Event('form-engine:devtools-ready'));
  return hook;
}
/** 默认产物不安装发现入口；页面仅暴露版本化只读请求，不保留旧 read/subscribe。 */
export function registerObservedProducer(
  owner: object,
  factory: Parameters<typeof lifecycle.registerObservedProducer>[1],
  parent?: object,
  info: Omit<ObservationProducerInfo, 'ref'> = {
    kind: 'runtime',
    label: 'Runtime',
    capabilities: ['metadata', 'values', 'events'],
  },
): () => void {
  if (!DEVTOOLS_ENABLED || !('window' in globalThis)) return () => {};
  try {
    const hook = ensureHook();
    const service = hook?.[DIRECTORY] ?? lifecycle;
    const stop = service.registerObservedProducer(owner, factory, parent);
    try {
      const producer = service.getObservedProducer(owner, budget);
      if (producer && hook?.[REGISTER]) hook[REGISTER](producer, info);
    } catch {
      /* 发现或工具注册失败不影响 Runtime。 */
    }
    return stop;
  } catch {
    return () => {};
  }
}
export function observedChildren(owner: object, maximum: number) {
  return DEVTOOLS_ENABLED && 'window' in globalThis
    ? directory().observedChildren(owner, maximum)
    : [];
}
export function observedProducerRef(owner: object) {
  return DEVTOOLS_ENABLED && 'window' in globalThis
    ? directory().observedProducerRef(owner)
    : undefined;
}
export function observedEntityId(owner: object, object: object) {
  return directory().observedEntityId(owner, object);
}
export function emitObservedEvent<K extends keyof ObservationPayloads>(
  owner: object,
  kind: K,
  payload: (ref: EventRef) => ObservationPayloads[K],
) {
  if (!DEVTOOLS_ENABLED || !('window' in globalThis)) return;
  return directory().emitObservedEvent(owner, kind, payload);
}

export { metadataRowKey } from './observation-metadata.js';

export { observedPreparedId, sharedPreparedCatalog } from './observation-definition.js';
