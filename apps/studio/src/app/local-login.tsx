'use client';
import { useEffect, useState } from 'react';
import { platform } from './platform-api';
export function LocalLogin({ disabled, onLogin }: { disabled: boolean; onLogin: () => void }) {
  const [status, setStatus] = useState<{ enabled: boolean; username?: string; roles?: string[] }>();
  useEffect(() => {
    let active = true;
    void platform<typeof status>('/local-login')
      .then((value) => {
        if (active) setStatus(value);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  if (!status?.enabled) return null;
  return (
    <div className="login-method">
      <button type="button" disabled={disabled} onClick={onLogin}>
        以本地开发账号登录
      </button>
      <p className="muted">
        本机开发环境 · {status.roles?.includes('admin') ? '管理员' : status.roles?.join('、')}
      </p>
    </div>
  );
}
