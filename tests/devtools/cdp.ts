import type { CDPSession } from '@playwright/test';
/** 仅测试 Chromium 的 DevTools 宿主；产品桥接不使用这些前端私有 API。 */
export async function attachTarget(cdp: CDPSession, targetId: string) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: false });
  let sequence = 0;
  return (expression: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => {
        cdp.off('Target.receivedMessageFromTarget', receive);
        reject(Error('DevTools target timed out'));
      }, 10_000);
      const receive = (event: { sessionId: string; message: string }) => {
        if (event.sessionId !== sessionId) return;
        const message = JSON.parse(event.message);
        if (message.id !== id) return;
        clearTimeout(timer);
        cdp.off('Target.receivedMessageFromTarget', receive);
        if (message.error || message.result?.exceptionDetails)
          reject(Error(JSON.stringify(message)));
        else resolve(message.result.result.value);
      };
      cdp.on('Target.receivedMessageFromTarget', receive);
      void cdp
        .send('Target.sendMessageToTarget', {
          sessionId,
          message: JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression, returnByValue: true, awaitPromise: true },
          }),
        })
        .catch(reject);
    });
}
