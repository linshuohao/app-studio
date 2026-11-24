import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { studioOrigin } from './session-http.js';

export const githubCallbackPath = '/api/platform/github/callback';

function configuration() {
  const clientId = process.env.PLATFORM_GITHUB_CLIENT_ID;
  const secret = process.env.PLATFORM_GITHUB_CLIENT_SECRET;
  const callback = process.env.PLATFORM_GITHUB_CALLBACK_URL;
  if (!clientId?.trim() || !secret?.trim() || !callback) return;
  try {
    const url = new URL(callback);
    if (
      url.href !== studioOrigin() + githubCallbackPath ||
      (url.protocol !== 'https:' && !['127.0.0.1', '[::1]'].includes(url.hostname))
    )
      return;
    return { clientId, secret, callback };
  } catch {
    return;
  }
}

@Injectable()
export class GitHubProvider {
  get enabled() {
    return configuration() !== undefined;
  }

  authorize(state: string, verifier: string) {
    const config = configuration();
    if (!config) throw new Error('GitHub OAuth is unavailable');
    const url = new URL('https://github.com/login/oauth/authorize');
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.callback,
      state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      code_challenge_method: 'S256',
      scope: '',
    }).toString();
    return url.href;
  }

  async identify(code: string, verifier: string) {
    const config = configuration();
    if (!config) throw new Error('GitHub OAuth is unavailable');
    const exchange = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.secret,
        redirect_uri: config.callback,
        code,
        code_verifier: verifier,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!exchange.ok) throw new Error('GitHub OAuth exchange failed');
    const { access_token: token } = (await exchange.json()) as { access_token?: unknown };
    if (typeof token !== 'string' || !token) throw new Error('GitHub OAuth token missing');
    const response = await fetch('https://api.github.com/user', {
      headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('GitHub identity request failed');
    const { id, login } = (await response.json()) as { id?: unknown; login?: unknown };
    if (
      typeof id !== 'number' ||
      !Number.isSafeInteger(id) ||
      id <= 0 ||
      typeof login !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(login)
    ) {
      throw new Error('GitHub identity invalid');
    }
    return { id: String(id), login };
  }
}
