import { afterEach, expect, it, vi } from 'vitest';
import {
  registerObservedProducer,
  emitObservedEvent,
  type ObservationProducer,
} from '@form-engine/runtime/devtools';
import { createObservationClient } from '../src/client/observation-client.js';
import { observationPageRequest } from '../src/bridge/observation-request.js';
afterEach(() => {
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
  vi.useRealTimers();
});
const factory = (ref: ObservationProducer['ref']): ObservationProducer => ({
  ref,
  snapshot: () => ({ revision: 0, rows: [{ record: 'header' }] }),
  revision: () => 0,
  inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
  inspect: () => ({ status: 'unsupported' }),
});
it('公开新版接缝到客户端：发现不取值、录制与游标重试、关闭资源', async () => {
  const owner = {},
    stop = registerObservedProducer(owner, factory);
  const evaluate = new Function(
    'command',
    `return (${observationPageRequest.toString()})(command);`,
  ) as typeof observationPageRequest;
  const client = createObservationClient({ request: async (command) => evaluate(command) }, () =>
    crypto.randomUUID(),
  );
  const discovery = (await client.query({ op: 'discover' })).result;
  if (discovery.status !== 'ok' || !('producers' in discovery)) throw Error('discover');
  const producer = discovery.producers[0]!.ref;
  const open = (await client.query({ op: 'openObservation', producer })).result;
  if (open.status !== 'ok' || !('sessionId' in open)) throw Error('open');
  const target = { producer, sessionId: open.sessionId };
  emitObservedEvent(owner, 'diagnostic', () => ({ code: 'test' }));
  const prepared = client.prepare({ op: 'readUpdates', ...target, cursor: open.cursor });
  const first = await client.send(prepared);
  expect(first.result).toMatchObject({ status: 'ok', events: [{ payload: { code: 'test' } }] });
  expect(await client.send(prepared)).toEqual(first);
  await client.query({ op: 'closeObservation', ...target });
  expect((await client.send(prepared)).result).toEqual({ status: 'session-expired' });
  stop();
});
it('页面晚加载与旧版本拒绝，不访问旧read/subscribe', () => {
  expect(observationPageRequest({ version: 2, requestId: 'r', op: 'discover' }).result.status).toBe(
    'waiting',
  );
  const read = vi.fn(),
    subscribe = vi.fn();
  Object.defineProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__', {
    value: { version: 1, read, subscribe },
    configurable: true,
  });
  expect(observationPageRequest({ version: 2, requestId: 'r', op: 'discover' }).result.status).toBe(
    'incompatible',
  );
  expect(read).not.toHaveBeenCalled();
  expect(subscribe).not.toHaveBeenCalled();
});
