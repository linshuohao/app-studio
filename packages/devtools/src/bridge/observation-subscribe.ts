import type {
  ObservationHook,
  ObservationPush,
  ObservationEvent,
} from '@form-engine/runtime/devtools';
/** 仅此自包含函数进入页面世界；不安装 Runtime、不读取业务值。 */
export function observationPageSubscribe(channel: string) {
  let stop: (() => void) | undefined;
  let closed = false;
  let ackTimer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = 0,
    sequence = 0,
    dropped = 0,
    bytes = 0;
  let directory: Extract<ObservationPush, { kind: 'directory' }> | undefined;
  let status: Extract<ObservationPush, { kind: 'status' }> | undefined;
  let events: Array<{ event: ObservationEvent; bytes: number }> = [];
  const flush = () => {
    if (closed || inFlight) return;
    let push: ObservationPush | undefined;
    if (status) {
      push = status;
      status = undefined;
    } else if (directory) {
      push = directory;
      directory = undefined;
    } else if (events.length || dropped) {
      push = { kind: 'events', events: events.map((item) => item.event), dropped };
      events = [];
      dropped = 0;
      bytes = 0;
    }
    if (!push) return;
    inFlight = ++sequence;
    ackTimer = setTimeout(() => {
      window.postMessage({ source: 'form-engine-observation-ended', channel }, '*');
      close();
    }, 10_000);
    window.postMessage(
      { source: 'form-engine-observation', channel, batchId: inFlight, push },
      '*',
    );
  };
  const send = (push: ObservationPush) => {
    if (closed) return;
    if (push.kind === 'directory') directory = push;
    else if (push.kind === 'status') status = push;
    else {
      dropped += push.dropped;
      for (const event of push.events) {
        const size = new TextEncoder().encode(JSON.stringify(event)).byteLength;
        if (size > 8_000_000) {
          dropped++;
          continue;
        }
        events.push({ event, bytes: size });
        bytes += size;
        while (events.length > 10000 || bytes > 8_000_000) {
          bytes -= events.shift()!.bytes;
          dropped++;
        }
      }
    }
    flush();
  };
  const connect = () => {
    if (closed || stop) return;
    const hook = (globalThis as unknown as { __FORM_ENGINE_DEVTOOLS__?: ObservationHook })
      .__FORM_ENGINE_DEVTOOLS__;
    if (!hook) {
      send({ kind: 'status', status: 'waiting' });
      return;
    }
    if (hook.version !== 2 || typeof hook.subscribe !== 'function') {
      send({ kind: 'status', status: 'incompatible' });
      return;
    }
    try {
      stop = hook.subscribe(send);
    } catch {
      send({ kind: 'status', status: 'unavailable' });
    }
  };
  const close = () => {
    closed = true;
    clearTimeout(ackTimer);
    stop?.();
    stop = undefined;
    events = [];
    directory = undefined;
    status = undefined;
    window.removeEventListener('message', receive);
    window.removeEventListener('form-engine:devtools-ready', connect);
    window.removeEventListener('pagehide', close);
  };
  const receive = (event: MessageEvent) => {
    if (event.source !== window || event.data?.channel !== channel) return;
    if (event.data.source === 'form-engine-observation-close') close();
    if (event.data.source === 'form-engine-observation-ack' && event.data.batchId === inFlight) {
      clearTimeout(ackTimer);
      ackTimer = undefined;
      inFlight = 0;
      flush();
    }
  };
  window.addEventListener('message', receive);
  window.addEventListener('form-engine:devtools-ready', connect);
  window.addEventListener('pagehide', close);
  connect();
  return true;
}
