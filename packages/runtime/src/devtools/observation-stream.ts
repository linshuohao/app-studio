import { captureObservationValue, type ObservationPlatform } from './observation-session.js';
import type {
  ObservationEvent,
  ObservationEventSink,
  ObservationLimits,
  ObservationProducerInfo,
  ObservationPush,
} from './observation-protocol.js';

/** 全连接共享采集一次，每个订阅独立有界队列；消费者永不进入业务调用栈。 */
export class ObservationStreams implements ObservationEventSink {
  private readonly subscribers = new Set<{
    listener: (push: ObservationPush) => void;
    directory: boolean;
    events: Array<{ event: ObservationEvent; bytes: number }>;
    bytes: number;
    dropped: number;
  }>();
  private cancel?: () => void;
  private disposed = false;
  constructor(
    private readonly limits: ObservationLimits,
    private readonly platform: ObservationPlatform,
    private readonly directory: () => readonly ObservationProducerInfo[],
  ) {}
  subscribe(listener: (push: ObservationPush) => void) {
    if (
      this.disposed ||
      typeof listener !== 'function' ||
      this.subscribers.size >= this.limits.maxSessions
    )
      throw Error('observation subscription unavailable');
    const subscriber = {
      listener,
      directory: true,
      events: [] as Array<{ event: ObservationEvent; bytes: number }>,
      bytes: 0,
      dropped: 0,
    };
    this.subscribers.add(subscriber);
    this.schedule();
    return () => {
      this.subscribers.delete(subscriber);
      subscriber.events.length = 0;
      if (!this.subscribers.size) {
        this.cancel?.();
        this.cancel = undefined;
      }
    };
  }
  interested(_kind: ObservationEvent['kind']) {
    return !this.disposed && this.subscribers.size > 0;
  }
  directoryChanged() {
    for (const subscriber of this.subscribers) subscriber.directory = true;
    this.schedule();
  }
  append: ObservationEventSink['append'] = (
    kind,
    payload,
    ref,
    monotonicTime = (
      globalThis as unknown as { performance?: { now(): number } }
    ).performance?.now() ?? Date.now(),
  ) => {
    if (!this.interested(kind)) return;
    let retained: { event: ObservationEvent; bytes: number } | undefined;
    try {
      const captured = captureObservationValue(
        { kind, ref: { ...ref }, monotonicTime, payload: payload() },
        this.limits.maxEventBytes,
      );
      retained = { event: captured.value as unknown as ObservationEvent, bytes: captured.bytes };
    } catch {
      /* 超预算也必须报告缺口。 */
    }
    for (const subscriber of this.subscribers) {
      if (retained) {
        subscriber.events.push(retained);
        subscriber.bytes += retained.bytes;
      } else subscriber.dropped++;
      while (
        subscriber.events.length > this.limits.maxEvents ||
        subscriber.bytes > this.limits.maxEventBytes
      ) {
        subscriber.bytes -= subscriber.events.shift()!.bytes;
        subscriber.dropped++;
      }
    }
    this.schedule();
  };
  private schedule() {
    if (this.cancel || !this.subscribers.size || this.disposed) return;
    this.cancel = this.platform.schedule(() => {
      this.cancel = undefined;
      for (const subscriber of [...this.subscribers]) {
        if (!this.subscribers.has(subscriber)) continue;
        const directory = subscriber.directory;
        const events = subscriber.events.map((item) => item.event),
          dropped = subscriber.dropped;
        subscriber.directory = false;
        subscriber.events = [];
        subscriber.bytes = 0;
        subscriber.dropped = 0;
        try {
          if (directory)
            subscriber.listener(
              Object.freeze({
                kind: 'directory',
                producers: Object.freeze([...this.directory()]),
                limits: this.limits,
              }),
            );
          if (this.subscribers.has(subscriber) && (events.length || dropped))
            subscriber.listener(
              Object.freeze({ kind: 'events', events: Object.freeze(events), dropped }),
            );
        } catch {
          // 坏消费者只撤销自己的观察，不传播到业务或其他订阅者。
          this.subscribers.delete(subscriber);
        }
      }
    }, 0);
  }
  dispose() {
    this.disposed = true;
    this.cancel?.();
    this.cancel = undefined;
    const subscribers = [...this.subscribers];
    this.subscribers.clear();
    if (!subscribers.length) return;
    this.platform.schedule(() => {
      for (const { listener } of subscribers) {
        try {
          listener({ kind: 'status', status: 'disconnected' });
        } catch {
          /* 隔离消费者。 */
        }
      }
    }, 0);
  }
}
