import { observationPageSubscribe } from '../bridge/observation-subscribe.js';
import type { ExtensionPort } from './port.js';
import { observationPageRequest } from '../bridge/observation-request.js';
import type { ObservationTransport } from '../client/observation-client.js';
import type { ObservationReply } from '@form-engine/runtime/devtools';
/** 仅声明本扩展实际使用的 Chrome API；不引入新的类型 / 运行时依赖。 */
export interface InspectedWindow {
  eval(
    expression: string,
    callback: (
      result: ObservationReply | undefined,
      exception?: {
        isException?: boolean;
        isError?: boolean;
        value?: string;
        description?: string;
      },
    ) => void,
  ): void;
}
export interface ExtensionConnection {
  tabId: number;
  connect(tabId: number, options: { name: string; frameId: number }): ExtensionPort;
  onNavigated: {
    addListener(listener: () => void): void;
    removeListener(listener: () => void): void;
  };
}
export function createExtensionTransport(
  inspected: InspectedWindow,
  connection?: ExtensionConnection,
): ObservationTransport {
  return {
    subscribe(listener) {
      if (!connection) {
        listener({ kind: 'status', status: 'unavailable' });
        return () => {};
      }
      let stopped = false,
        active: ExtensionPort | undefined;
      const connect = () => {
        active?.disconnect();
        if (stopped) return;
        const channel = crypto.randomUUID();
        const port = connection.connect(connection.tabId, {
          name: `form-engine-observation:${channel}`,
          frameId: 0,
        });
        active = port;
        port.onMessage.addListener((message) => {
          if (stopped || active !== port) return;
          if (
            message &&
            typeof message === 'object' &&
            'bridge' in message &&
            message.bridge === 'ready'
          ) {
            inspected.eval(
              `(${observationPageSubscribe.toString()})(${JSON.stringify(channel)})`,
              (_reply, error) => {
                if (!stopped && active === port && (error?.isException || error?.isError))
                  listener({ kind: 'status', status: 'unavailable' });
              },
            );
          } else if (
            message &&
            typeof message === 'object' &&
            'batchId' in message &&
            'push' in message &&
            Number.isSafeInteger(message.batchId)
          ) {
            try {
              listener(message.push as Parameters<typeof listener>[0]);
            } finally {
              port.postMessage({ ack: message.batchId });
            }
          }
        });
        port.onDisconnect.addListener(() => {
          if (!stopped && active === port) {
            active = undefined;
            listener({ kind: 'status', status: 'disconnected' });
          }
        });
      };
      connection.onNavigated.addListener(connect);
      connect();
      return () => {
        stopped = true;
        connection.onNavigated.removeListener(connect);
        active?.disconnect();
        active = undefined;
      };
    },
    request: (command) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('页面连接超时')), 3_000);
        inspected.eval(
          `(${observationPageRequest.toString()})(${JSON.stringify(command)})`,
          (result, error) => {
            clearTimeout(timer);
            if (error?.isException || error?.isError)
              reject(Error(error.description ?? error.value ?? '页面连接失败'));
            else
              resolve(
                result ?? {
                  version: 2,
                  requestId: command.requestId,
                  result: { status: 'waiting' },
                },
              );
          },
        );
      }),
  };
}
