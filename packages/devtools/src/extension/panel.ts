import { createExtensionTransport, type InspectedWindow } from './transport.js';
import { mountDevtools } from '../ui/mount.js';
declare const chrome: { devtools: { inspectedWindow: InspectedWindow } };
const root = document.getElementById('root');
if (root) {
  const destroy = mountDevtools(root, createExtensionTransport(chrome.devtools.inspectedWindow));
  globalThis.addEventListener('pagehide', destroy, { once: true });
}
