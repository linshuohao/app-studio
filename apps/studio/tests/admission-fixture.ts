import { expect, type APIRequestContext } from '@playwright/test';

// A real local API + test-provider setup helper, never a production bypass endpoint.
export async function registerGitHubAccount(
  request: APIRequestContext,
  origin: string,
  code: string,
) {
  const start = await request.post(origin + '/api/platform/github/login', {
    headers: { Origin: origin },
    data: {},
  });
  expect(start.status()).toBe(200);
  const authorize = new URL((await start.json()).url);
  const callback = new URL(authorize.searchParams.get('redirect_uri')!);
  callback.searchParams.set('state', authorize.searchParams.get('state')!);
  callback.searchParams.set('code', code);
  const result = await request.get(callback.href, { maxRedirects: 0 });
  expect(result.headers().location).toBe('/?github=registration-required');
  const registered = await request.post(origin + '/api/platform/github/register', {
    headers: { Origin: origin },
    data: {},
  });
  expect(registered.status()).toBe(200);
  return registered.json();
}
