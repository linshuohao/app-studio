'use client';
import { useState } from 'react';
import { platform, PlatformError, failureMessage } from './platform-api';
export function PasswordSettings() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  return (
    <section className="surface authoring-panel">
      <h2>修改密码</h2>
      <p className="muted">
        新密码至少 12 个字符，最多 256
        字节。输入当前内置密码确认；修改成功后保留当前会话，其他登录会话将失效，需要重新登录。
      </p>
      <form
        className="authoring-fields"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          const form = event.currentTarget;
          const fields = new FormData(form);
          setError('');
          setMessage('');
          if (fields.get('password') !== fields.get('confirmPassword')) {
            setError('两次输入的新密码不一致。');
            return;
          }
          setBusy(true);
          try {
            await platform('/password', {
              body: {
                currentPassword: fields.get('currentPassword'),
                password: fields.get('password'),
              },
            });
            form.reset();
            setMessage('密码已更新，其他会话已退出。');
          } catch (reason) {
            setError(
              reason instanceof PlatformError && reason.status === 401
                ? '当前密码不正确或会话已失效。'
                : reason instanceof PlatformError && reason.status === 409
                  ? '密码已被其他请求修改，请用最新密码重新验证。'
                  : reason instanceof PlatformError && reason.status === 400
                    ? '新密码需至少 12 个字符且最多 256 字节。'
                    : failureMessage(reason),
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="current-password">当前密码</label>
        <input
          id="current-password"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          disabled={busy}
        />
        <label htmlFor="new-password">新密码</label>
        <input
          id="new-password"
          name="password"
          type="password"
          minLength={12}
          maxLength={256}
          required
          autoComplete="new-password"
          disabled={busy}
        />
        <label htmlFor="confirm-password">确认新密码</label>
        <input
          id="confirm-password"
          name="confirmPassword"
          type="password"
          minLength={12}
          maxLength={256}
          required
          autoComplete="new-password"
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          {busy ? '正在更新…' : '更新密码'}
        </button>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
      </form>
    </section>
  );
}
