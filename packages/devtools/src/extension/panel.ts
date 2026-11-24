import {
  createExtensionTransport,
  type InspectedWindow,
  type ExtensionConnection,
} from './transport.js';
import { mountDevtools } from '../ui/mount.js';
declare const chrome: {
  devtools: {
    inspectedWindow: InspectedWindow & { tabId: number };
    network: { onNavigated: ExtensionConnection['onNavigated'] };
  };
  tabs: { connect: ExtensionConnection['connect'] };
};
const root = document.getElementById('root');
if (root) {
  const destroy = mountDevtools(
    root,
    createExtensionTransport(chrome.devtools.inspectedWindow, {
      tabId: chrome.devtools.inspectedWindow.tabId,
      connect: (tabId, options) => chrome.tabs.connect(tabId, options),
      onNavigated: chrome.devtools.network.onNavigated,
    }),
  );
  globalThis.addEventListener('pagehide', destroy, { once: true });
}
