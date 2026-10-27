import type { DevtoolsEvent, DevtoolsHook } from '@form-engine/runtime/devtools';
/** 只读工具客户端。缓冲属于工具，断开即释放；从不调用 Runtime 指令或 validate。 */
export function connectDevtools(hook?: DevtoolsHook) {
  if (!hook || hook.version !== 1) return undefined;
  let connected = true,
    dropped = 0;
  let events: DevtoolsEvent[] = [];
  const dispose = hook.subscribe((event) => {
    if (!connected) return;
    if (events.length === 100) {
      events.shift();
      dropped++;
    }
    dropped += event.dropped;
    events.push(event);
  });
  return {
    list: () => (connected ? hook.list() : []),
    inspect: (id: string) => (connected ? hook.read(id) : undefined),
    events: () => Object.freeze(events.slice()),
    dropped: () => dropped,
    disconnect: () => {
      connected = false;
      dispose();
      events = [];
      dropped = 0;
    },
  };
}
