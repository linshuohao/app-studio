import { validObservationResult, validObservationPush } from './observation-reply.js';
import type {
  ObservationCommand,
  ObservationReply,
  ObservationRequest,
  ObservationPush,
} from '@form-engine/runtime/devtools';
export interface ObservationTransport {
  subscribe?(listener: (push: ObservationPush) => void): () => void;
  request(command: ObservationRequest): Promise<ObservationReply>;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** 无隐式轮询、自动重试或读取。调用方保留请求即可在丢包后以相同 requestId / 游标重试。 */
export function createObservationClient(transport: ObservationTransport, token: () => string) {
  const prepare = (command: ObservationCommand): ObservationRequest =>
    freeze({ ...structuredClone(command), version: 2, requestId: token() });
  const send = async (command: ObservationRequest): Promise<ObservationReply> => {
    const requestId = command.requestId;
    const fail = (status: 'incompatible' | 'unavailable'): ObservationReply => ({
      version: 2,
      requestId,
      result: { status },
    });
    try {
      const fixed = freeze(structuredClone(command));
      const reply = structuredClone(await transport.request(structuredClone(fixed)));
      if (reply.version !== 2) return fail('incompatible');
      if (reply.requestId !== fixed.requestId || !validObservationResult(fixed, reply.result))
        return fail('unavailable');
      return freeze(reply);
    } catch {
      return fail('unavailable');
    }
  };
  return Object.freeze({
    prepare,
    send,
    subscribe: (listener: (push: ObservationPush) => void) => {
      if (!transport.subscribe) {
        listener({ kind: 'status', status: 'incompatible' });
        return () => {};
      }
      return transport.subscribe((input) => {
        try {
          const push = structuredClone(input);
          if (validObservationPush(push)) listener(freeze(push));
          else listener({ kind: 'status', status: 'unavailable' });
        } catch {
          listener({ kind: 'status', status: 'unavailable' });
        }
      });
    },
    query: (command: ObservationCommand) => send(prepare(command)),
  });
}
