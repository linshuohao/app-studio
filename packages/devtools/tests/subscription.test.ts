import { afterEach, expect, it, vi } from 'vitest';
import { observationPageSubscribe } from '../src/bridge/observation-subscribe.js';
import { ObservationStore } from '../src/client/observation-store.js';
import type {
  ObservationEvent,
  ObservationHook,
  ObservationPush,
} from '@form-engine/runtime/devtools';
const listeners = new Set<(push: ObservationPush) => void>();
function hook() {
  Object.defineProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__', {
    configurable: true,
    value: {
      version: 2,
      request: vi.fn(),
      subscribe: (listener: (push: ObservationPush) => void) => {
        listeners.add(listener);
        listener({ kind: 'events', events: [], dropped: 1 });
        return () => listeners.delete(listener);
      },
    } satisfies ObservationHook,
  });
}
function message(source: string, channel: string, extra = {}) {
  window.dispatchEvent(
    new MessageEvent('message', { source: window, data: { source, channel, ...extra } }),
  );
}
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  listeners.clear();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('晚于关闭消息的注入不能永久占用订阅，无 ACK 到期自动释放', () => {
  vi.useFakeTimers();
  hook();
  const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  message('form-engine-observation-close', 'late');
  const inject = new Function(
    'channel',
    `return (${observationPageSubscribe.toString()})(channel)`,
  ) as typeof observationPageSubscribe;
  inject('late');
  expect(listeners.size).toBe(1);
  vi.advanceTimersByTime(10_001);
  expect(listeners.size).toBe(0);
  expect(post.mock.calls.at(-1)![0]).toMatchObject({
    source: 'form-engine-observation-ended',
    channel: 'late',
  });
  expect(vi.getTimerCount()).toBe(0);
});
it('一次一批确认，等待期间事件有界并报告缺口；关闭和晚加载清理监听', () => {
  vi.useFakeTimers();
  const post = vi.spyOn(window, 'postMessage').mockImplementation(() => {});
  observationPageSubscribe('channel');
  expect(post.mock.calls[0]![0]).toMatchObject({ push: { status: 'waiting' } });
  message('form-engine-observation-ack', 'channel', { batchId: 1 });
  hook();
  window.dispatchEvent(new Event('form-engine:devtools-ready'));
  const listener = [...listeners][0]!;
  for (let index = 0; index < 10100; index++)
    listener({
      kind: 'events',
      dropped: 0,
      events: [
        {
          ref: { producerId: 'p', epoch: 'e', sequence: index },
          kind: 'diagnostic',
          payload: { index },
        },
      ],
    });
  expect(post).toHaveBeenCalledTimes(2);
  message('form-engine-observation-ack', 'other', { batchId: 2 });
  expect(post).toHaveBeenCalledTimes(2);
  message('form-engine-observation-ack', 'channel', { batchId: 2 });
  expect(post.mock.calls[2]![0]).toMatchObject({ push: { kind: 'events', dropped: 100 } });
  expect(post.mock.calls[2]![0].push.events).toHaveLength(10000);
  message('form-engine-observation-close', 'channel');
  expect(listeners.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
it('全生产者长期变化时，事件与去重命名空间都有界', () => {
  const store = new ObservationStore(100, 2);
  for (let index = 0; index < 1000; index++)
    store.updates(
      [
        {
          ref: { producerId: `p${index}`, epoch: 'e', sequence: 1 },
          kind: 'diagnostic',
          payload: {},
        } satisfies ObservationEvent,
      ],
      0,
    );
  expect(store.events).toHaveLength(2);
  expect((store as unknown as { through: Map<string, number> }).through.size).toBe(2);
  store.updates([store.events[0]!], 0);
  expect(store.events).toHaveLength(2);
});
