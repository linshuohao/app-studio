import type { ExtensionPort } from './port.js';
declare const chrome: {
  runtime: { onConnect: { addListener(listener: (port: ExtensionPort) => void): void } };
};
// 静态 content script 只注册桥监听；面板未连接时不订阅、不收集页面事实。
chrome.runtime.onConnect.addListener((port) => {
  if (!port.name.startsWith('form-engine-observation:')) return;
  const channel = port.name.slice('form-engine-observation:'.length);
  const receive = (event: MessageEvent) => {
    if (
      event.source !== window ||
      !['form-engine-observation', 'form-engine-observation-ended'].includes(event.data?.source) ||
      event.data.channel !== channel
    )
      return;
    if (event.data.source === 'form-engine-observation-ended') {
      close();
      port.disconnect();
      return;
    }
    try {
      port.postMessage({ batchId: event.data.batchId, push: event.data.push });
    } catch {
      close();
    }
  };
  const close = () => {
    window.removeEventListener('message', receive);
    window.postMessage({ source: 'form-engine-observation-close', channel }, '*');
  };
  window.addEventListener('message', receive);
  port.onDisconnect.addListener(close);
  port.onMessage.addListener((message) => {
    if (
      message &&
      typeof message === 'object' &&
      'ack' in message &&
      Number.isSafeInteger(message.ack)
    )
      window.postMessage(
        { source: 'form-engine-observation-ack', channel, batchId: message.ack },
        '*',
      );
  });
  port.postMessage({ bridge: 'ready' });
});
