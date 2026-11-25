'use client';

import { useSyncExternalStore } from 'react';
import styles from './browser-connectivity-status.module.css';

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

export function BrowserConnectivityStatus() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return (
    <div className={styles.status} role="status">
      {!online && <span className={styles.notice}>浏览器当前处于离线状态</span>}
    </div>
  );
}
