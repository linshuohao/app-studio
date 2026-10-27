import { pageRequest } from '../bridge/page-request.js';
import type { DevtoolsTransport, PageReply } from '../bridge/types.js';
/** 仅声明本扩展实际使用的 Chrome API；不引入新的类型 / 运行时依赖。 */
export interface InspectedWindow {
  eval(
    expression: string,
    callback: (
      result: PageReply | undefined,
      exception?: {
        isException?: boolean;
        isError?: boolean;
        value?: string;
        description?: string;
      },
    ) => void,
  ): void;
}
export function createExtensionTransport(inspected: InspectedWindow): DevtoolsTransport {
  return {
    request: (command) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('页面连接超时')), 3_000);
        inspected.eval(
          `(${pageRequest.toString()})(${JSON.stringify(command)})`,
          (result, error) => {
            clearTimeout(timer);
            if (error?.isException || error?.isError)
              reject(Error(error.description ?? error.value ?? '页面连接失败'));
            else resolve(result ?? { status: 'waiting', sources: [], events: [], dropped: 0 });
          },
        );
      }),
  };
}
