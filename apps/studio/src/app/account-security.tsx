'use client';
import { OperationRecords } from './operation-records';

import { useEffect, useEffectEvent, useRef, useState, type FormEvent } from 'react';
import { GitHubAccount } from './github-account';
import { PasswordSettings } from './password-settings';
import {
  type Account,
  accessDenied,
  failureMessage,
  outcomeUnknown,
  platform,
  PlatformError,
} from './platform-api';

type SetupStatus = {
  enabled: boolean;
  hasPassword: boolean;
  githubLogin: string | null;
  verified: boolean;
  expiresAt: number | null;
};

function PasswordSetup({
  disabled,
  onComplete,
  onSessionLost,
}: {
  disabled: boolean;
  onComplete: () => Promise<void>;
  onSessionLost: (message?: string) => void;
}) {
  const [status, setStatus] = useState<SetupStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const mounted = useRef(false);
  const operation = useRef(0);
  const expireSession = useEffectEvent(onSessionLost);
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void platform<SetupStatus>('/account/password/setup').then(
      (result) => {
        if (active) {
          setStatus(result);
          setError('');
        }
      },
      (reason) => {
        if (active) {
          if (reason instanceof PlatformError && reason.status === 401) expireSession();
          else setError(failureMessage(reason));
        }
      },
    );
    return () => {
      active = false;
      mounted.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate unfinished setup work on logout, navigation or refresh.
      ++operation.current;
    };
  }, [reload]);
  async function verify() {
    if (busy || disabled) return;
    const id = ++operation.current;
    setBusy(true);
    setError('');
    try {
      const { url } = await platform<{ url: string }>('/github/password-setup', {});
      if (mounted.current && operation.current === id) window.location.assign(url);
    } catch (reason) {
      if (!mounted.current || operation.current !== id) return;
      if (reason instanceof PlatformError && reason.status === 401) onSessionLost();
      else setError(failureMessage(reason));
      setBusy(false);
    }
  }
  async function setup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || disabled) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = String(fields.get('username') ?? '');
    const password = String(fields.get('password') ?? '');
    if (password !== fields.get('confirmPassword')) {
      setError('两次输入的密码不一致。');
      return;
    }
    if (new TextEncoder().encode(password).length > 256) {
      setError('密码最多256字节，请缩短后重试。');
      return;
    }
    const id = ++operation.current;
    const current = () => mounted.current && operation.current === id;
    setBusy(true);
    setError('');
    try {
      await platform<Account>('/account/password/setup', { body: { username, password } });
      if (!current()) return;
      form.reset();
      await onComplete();
    } catch (reason) {
      if (!current()) return;
      if (outcomeUnknown(reason) || (reason instanceof PlatformError && reason.status === 409)) {
        try {
          const account = await platform<Account>('/account');
          if (!current()) return;
          if (account.hasPassword) {
            form.reset();
            await onComplete();
            return;
          }
        } catch (failure) {
          if (current() && failure instanceof PlatformError && failure.status === 401) {
            onSessionLost();
            return;
          }
          /* Keep the original result; do not assume a successful setup. */
        }
      }
      if (!current()) return;
      if (reason instanceof PlatformError && reason.status === 401) onSessionLost();
      else if (accessDenied(reason)) {
        setStatus((previous) => previous && { ...previous, verified: false, expiresAt: null });
        setError('身份验证已失效，请重新验证 GitHub 后设置登录方式。');
      } else
        setError(
          reason instanceof PlatformError && reason.status === 409
            ? '用户名已被占用，或登录方式已变化。请更换用户名后重试，账号不会自动合并。'
            : reason instanceof PlatformError && reason.status === 400
              ? '用户名需为1至64位字母、数字、下划线、点或短横线；密码至少12字符且最多256字节。'
              : failureMessage(reason),
        );
    } finally {
      if (current()) setBusy(false);
    }
  }
  return (
    <section className="surface authoring-panel">
      <h2>设置内置登录方式</h2>
      <p>可以继续仅用 GitHub 登录。添加内置登录方式前，请重新验证当前绑定的 GitHub 身份。</p>
      <p className="muted">
        设置成功后保留本次登录会话，其他登录会话立即失效，需要重新登录。之后可使用用户名和密码登录同一个平台账号。
      </p>
      {!status ? (
        <>
          {!error && <p role="status">正在读取验证状态…</p>}
          <button
            type="button"
            className="quiet"
            disabled={busy || disabled}
            onClick={() => setReload((value) => value + 1)}
          >
            刷新验证状态
          </button>
        </>
      ) : status.verified ? (
        <form className="authoring-fields" onSubmit={(event) => void setup(event)}>
          <p role="status">已验证 GitHub 身份 @{status.githubLogin}，请在验证有效期内完成设置。</p>
          <label htmlFor="setup-username">登录用户名</label>
          <input
            id="setup-username"
            name="username"
            autoComplete="username"
            pattern="[a-zA-Z0-9_.\-]{1,64}"
            maxLength={64}
            required
            disabled={busy || disabled}
          />
          <label htmlFor="setup-password">设置密码</label>
          <input
            id="setup-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
            disabled={busy || disabled}
          />
          <label htmlFor="setup-confirm-password">确认设置密码</label>
          <input
            id="setup-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={256}
            required
            disabled={busy || disabled}
          />
          <p className="muted">
            用户名1至64位，可用字母、数字、下划线、点和短横线。密码至少12字符，最多256字节。
          </p>
          <button type="submit" disabled={busy || disabled}>
            {busy ? '正在设置…' : '保存内置登录方式'}
          </button>
        </form>
      ) : (
        <>
          {!status.enabled && <p>当前环境未配置 GitHub 授权，暂时无法重新验证。</p>}
          <button
            type="button"
            disabled={busy || disabled || !status.enabled}
            onClick={() => void verify()}
          >
            重新验证 GitHub 身份
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function AccountSecurity({
  account,
  disabled,
  onRefresh,
  recordsRequested,
  onRecordsClose,
  onSessionLost,
}: {
  account: Account;
  disabled: boolean;
  recordsRequested?: boolean;
  onRecordsClose?: () => void;
  onRefresh: () => Promise<void>;
  onSessionLost: (message?: string) => void;
}) {
  const [records, setRecords] = useState(false);
  const [notice, setNotice] = useState('');
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return (
    <>
      <div className="action-row">
        <button className="quiet" onClick={() => setRecords(true)}>
          安全记录
        </button>
      </div>
      {(records || recordsRequested) && (
        <OperationRecords
          key={account.userId}
          kind="security"
          title="账号安全记录"
          scopeLabel={account.username ?? account.githubLogin ?? '当前账号'}
          path="/account/operations"
          onClose={() => {
            setRecords(false);
            onRecordsClose?.();
          }}
        />
      )}
      {notice && <p role="status">{notice}</p>}
      <GitHubAccount
        disabled={disabled}
        hasPassword={account.hasPassword}
        onSessionLost={onSessionLost}
      />
      {account.hasPassword ? (
        <>
          <p>内置登录用户名：{account.username}</p>
          <PasswordSettings />
        </>
      ) : (
        <PasswordSetup
          disabled={disabled}
          onSessionLost={onSessionLost}
          onComplete={async () => {
            if (!mounted.current) return;
            await onRefresh();
            if (mounted.current) setNotice('内置登录方式已设置，其他会话已退出。');
          }}
        />
      )}
    </>
  );
}
