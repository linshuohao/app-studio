'use client';

import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from 'react';
import { failureMessage, platform, PlatformError } from './platform-api';

type Binding = { enabled: boolean; login: string | null };

const results: Record<string, string> = {
  'signed-in': '已使用 GitHub 登录。',
  bound: '已绑定 GitHub 账号。',
  'password-setup-verified': 'GitHub 身份已重新验证，请设置内置登录方式。',
  'registration-required': 'GitHub 身份已验证，请确认是否创建平台账号。',
  invalid: 'GitHub 授权已失效，请重新发起。',
  cancelled: '已取消 GitHub 授权。',
  unavailable: '暂时无法完成 GitHub 授权，请重试。',
  conflict:
    'GitHub 身份与本次操作不匹配，或已绑定其他平台账号。不会自动合并账号，请返回原账号核对绑定。',
};

export function useGitHubResult() {
  const [result, setResult] = useState<{ code: string; message: string }>();
  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('github');
    if (result === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 一次性读取 OAuth 回调 URL 并清除查询参数，必须在客户端挂载后执行。
    setResult({
      code: result,
      message: Object.hasOwn(results, result) ? results[result]! : results.invalid!,
    });
    url.searchParams.delete('github');
    if (result === 'bound' || result === 'password-setup-verified' || result === 'conflict')
      url.searchParams.set('page', 'account');
    window.history.replaceState(null, '', url);
  }, []);
  return { result, clear: () => setResult(undefined) };
}

export function GitHubLogin({ disabled }: { disabled: boolean }) {
  const [enabled, setEnabled] = useState<boolean | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    void platform<{ enabled: boolean }>('/github/enabled')
      .then(({ enabled }) => setEnabled(enabled))
      .catch(() => setError('暂时无法读取 GitHub 登录配置，可使用内置账号登录。'));
  }, []);

  async function login() {
    if (pending || disabled || !enabled) return;
    setPending(true);
    setError('');
    try {
      const { url } = await platform<{ url: string }>('/github/login', {});
      window.location.assign(url);
    } catch (error) {
      setError(failureMessage(error));
      setPending(false);
    }
  }

  return (
    <div className="login-method">
      <button
        type="button"
        disabled={disabled || pending || !enabled}
        onClick={() => void login()}
        aria-describedby="github-login-description"
      >
        用 GitHub 登录
      </button>
      <p id="github-login-description" className="muted" role={error ? 'alert' : 'status'}>
        {error ||
          (enabled === undefined
            ? '正在检查 GitHub 登录是否可用…'
            : !enabled
              ? '当前环境未配置 GitHub 登录，暂不可用；请使用内置账号登录。'
              : '首次使用 GitHub 可创建平台账号，加入团队仍需管理员审批。')}
      </p>
    </div>
  );
}

export function GitHubAccount({
  disabled,
  onSessionLost,
  hasPassword = true,
}: {
  disabled: boolean;
  hasPassword?: boolean;
  onSessionLost: (message?: string) => void;
}) {
  const mounted = useRef(false);
  const operation = useRef(0);
  const loseSession = useEffectEvent(onSessionLost);
  const [binding, setBinding] = useState<Binding>();
  const [notice, setNotice] = useState('');
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    mounted.current = true;
    void platform<Binding>('/github/binding')
      .then((result) => {
        if (!active) return;
        setBinding(result);
        setError('');
      })
      .catch((reason) => {
        if (!active) return;
        if (reason instanceof PlatformError && reason.status === 401) loseSession();
        else setError(failureMessage(reason));
      });
    return () => {
      active = false;
      mounted.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- Invalidate pending binding actions after logout or navigation.
      ++operation.current;
    };
  }, [reload]);

  async function changeBinding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const password = new FormData(form).get('github-password');
    form.reset();
    if (pending || disabled || !mounted.current) return;
    const id = ++operation.current;
    const current = () => mounted.current && operation.current === id;
    setPending(true);
    setError('');
    try {
      if (binding?.login) {
        await platform('/github/unbind', { body: { password } });
        if (!current()) return;
        setNotice('已解绑 GitHub 账号。');
        try {
          const latest = await platform<Binding>('/github/binding');
          if (!current()) return;
          setBinding(latest);
        } catch (reason) {
          if (!current()) return;
          if (reason instanceof PlatformError && reason.status === 401) {
            onSessionLost('解绑成功，请使用内置账号重新登录。');
            return;
          }
          throw reason;
        }
        setPending(false);
      } else {
        const { url } = await platform<{ url: string }>('/github/bind', { body: { password } });
        if (current()) window.location.assign(url);
      }
    } catch (error) {
      if (!current()) return;
      setError(
        error instanceof PlatformError && error.status === 409
          ? '绑定状态已变化或身份已被占用。不会自动合并账号，请刷新并核对原账号。'
          : failureMessage(error),
      );
      setPending(false);
    }
  }

  if (!binding)
    return (
      <section className="surface authoring-panel">
        <h2>GitHub 账号</h2>
        {error ? (
          <p role="alert">
            {error}{' '}
            <button type="button" onClick={() => setReload((value) => value + 1)}>
              重试读取绑定
            </button>
          </p>
        ) : (
          <p role="status">正在读取绑定状态…</p>
        )}
      </section>
    );
  if (!binding.enabled && !binding.login)
    return (
      <section className="surface authoring-panel">
        <h2>GitHub 账号</h2>
        <p>当前环境未配置 GitHub 登录，可继续使用内置账号。</p>
      </section>
    );
  return (
    <section className="surface authoring-panel">
      <h2>GitHub 账号</h2>
      {notice && <p role="status">{notice}</p>}
      <p>{binding.login ? '已绑定 @' + binding.login : '尚未绑定 GitHub 账号。'}</p>
      {!hasPassword ? (
        <p className="muted">GitHub 是当前唯一登录方式，不能解绑。设置内置登录方式后才可解绑。</p>
      ) : (
        <>
          <p className="muted">
            {binding.login
              ? '解绑后不能再用此 GitHub 账号登录，相关 GitHub 登录会话将撤销；内置账号仍可使用。操作需要确认内置密码。'
              : '绑定后可用 GitHub 登录当前已有账号；请先确认内置密码，再前往 GitHub 授权。'}
          </p>
          <form onSubmit={(event) => void changeBinding(event)}>
            <label htmlFor="github-password">确认内置密码</label>
            <input
              id="github-password"
              name="github-password"
              type="password"
              autoComplete="current-password"
              required
            />
            <button type="submit" disabled={disabled || pending}>
              {binding.login ? '解绑 GitHub' : '绑定 GitHub'}
            </button>
          </form>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
