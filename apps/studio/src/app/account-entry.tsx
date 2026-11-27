'use client';

import { PageHeading } from './page-heading';

import { useState } from 'react';
import { JoinApplication } from './join-requests';
import { AccountSecurity } from './account-security';
import {
  type Account,
  type Registration,
  failureMessage,
  platform,
  PlatformError,
} from './platform-api';

export function RegistrationConfirmation({
  registration,
  onComplete,
  onCancel,
}: {
  registration: Registration;
  onComplete: () => Promise<void>;
  onCancel: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await platform<Account>('/github/register', {});
      await onComplete();
    } catch (reason) {
      // A lost registration response may already have created the account/session.
      try {
        await platform<Account>('/account');
        await onComplete();
        return;
      } catch {
        /* retain the original error */
      }
      setError(
        reason instanceof PlatformError && reason.status === 401
          ? '注册确认已过期，请返回登录页重新使用 GitHub 继续。'
          : failureMessage(reason),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="surface login" aria-labelledby="registration-title">
      <h1 id="registration-title">创建平台账号</h1>
      <p>
        你正在使用 GitHub 账号 <strong>@{registration.login}</strong>。
      </p>
      <p>创建后需要申请加入团队，并由管理员批准，才能访问团队表单和目录。</p>
      <p className="muted">
        已有平台账号？请返回登录原账号，在账号设置中绑定 GitHub，避免创建重复账号。
      </p>
      <button type="button" disabled={busy} onClick={() => void confirm()}>
        {busy ? '正在创建…' : '确认创建账号'}
      </button>
      <button
        type="button"
        className="quiet"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            await onCancel();
          } catch (reason) {
            setError(failureMessage(reason));
            setBusy(false);
          }
        }}
      >
        返回登录已有账号
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function AccountAdmission({
  account,
  onRefresh,
  onLogout,
  onSessionLost,
  settings,
  onSettingsChange,
}: {
  account: Account;
  settings: boolean;
  onSettingsChange: (settings: boolean) => void;
  onRefresh: () => Promise<void>;
  onLogout: () => Promise<void>;
  onSessionLost: (message?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (reason) {
      setError(failureMessage(reason));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="authoring-panel">
      <PageHeading title={settings ? '账号与安全' : '团队访问资格'}>
        <button
          type="button"
          className="quiet"
          disabled={busy}
          onClick={() => onSettingsChange(!settings)}
        >
          {settings ? '返回团队状态' : '账号设置'}
        </button>
        <button type="button" className="quiet" disabled={busy} onClick={() => void run(onLogout)}>
          退出登录
        </button>
      </PageHeading>
      <p>
        当前账号：
        {account.username ?? (account.githubLogin ? '@' + account.githubLogin : account.userId)}
      </p>
      {settings ? (
        <>
          <AccountSecurity
            key={account.userId}
            account={account}
            disabled={busy}
            onRefresh={onRefresh}
            onSessionLost={onSessionLost}
          />
        </>
      ) : (
        <section className="surface authoring-panel">
          <h2>
            {account.membership.status === 'suspended' ? '团队成员资格已停用' : '尚未加入团队'}
          </h2>
          <p>
            {account.membership.status === 'suspended'
              ? '请联系团队管理员恢复资格。你仍可管理本人的登录方式，不能重新申请绕过停用。'
              : '平台账号已登录。加入团队并获得管理员批准后，才能访问表单、物料和纯函数目录。'}
          </p>
          {account.membership.status === 'none' ? (
            <JoinApplication
              key={account.userId}
              onRefresh={onRefresh}
              onSessionLost={onSessionLost}
            />
          ) : (
            <button type="button" disabled={busy} onClick={() => void run(onRefresh)}>
              刷新团队状态
            </button>
          )}
        </section>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
