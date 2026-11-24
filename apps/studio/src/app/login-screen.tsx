'use client';
import { type FormEvent, useState } from 'react';
import { GitHubLogin } from './github-account';
import { LocalLogin } from './local-login';

export function LoginScreen({
  busy,
  onPasswordLogin,
  onLocalLogin,
}: {
  busy: boolean;
  onPasswordLogin: (event: FormEvent<HTMLFormElement>) => void;
  onLocalLogin: () => void;
}) {
  const [method, setMethod] = useState<'choose' | 'password'>('choose');
  return (
    <section className="login-screen" aria-label="登录表单工作台">
      <div className="login-mark" aria-hidden="true">
        {'{ }'}
      </div>
      <h1>{method === 'choose' ? '登录表单工作台' : '使用账号密码登录'}</h1>
      <p className="login-description">
        {method === 'choose' ? '选择登录方式，继续你的工作。' : '输入你的内置账号信息。'}
      </p>
      {method === 'choose' ? (
        <div className="login-methods">
          <LocalLogin disabled={busy} onLogin={onLocalLogin} />
          <GitHubLogin disabled={busy} />
          <div className="login-method">
            <button
              type="button"
              className="login-password-choice"
              disabled={busy}
              onClick={() => setMethod('password')}
            >
              使用账号密码登录
            </button>
          </div>
        </div>
      ) : (
        <form className="login-password-form" onSubmit={onPasswordLogin}>
          <label htmlFor="username">用户名</label>
          <input id="username" name="username" autoComplete="username" required />
          <label htmlFor="password">密码</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? '正在登录…' : '登录'}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={busy}
            onClick={() => setMethod('choose')}
          >
            返回其他登录方式
          </button>
        </form>
      )}
    </section>
  );
}
