import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { defaultSpaceId, hashPassword } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
const origin = 'http://127.0.0.1:3200';
const password = 'local-integration-password';
it('binds and signs in as the same user, rejects replay and revokes only GitHub sessions', async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  vi.stubEnv('PLATFORM_GITHUB_CLIENT_ID', 'test-client');
  vi.stubEnv('PLATFORM_GITHUB_CLIENT_SECRET', 'test-secret');
  vi.stubEnv('PLATFORM_GITHUB_CALLBACK_URL', origin + '/api/platform/github/callback');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    const db = module.get(PlatformDatabase).executor;
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    await db.execute("INSERT INTO platform_users VALUES ('user', 1)");
    await db.execute("INSERT INTO platform_members VALUES ('member', 'user', $1, 1)", [
      defaultSpaceId,
    ]);
    await db.execute("INSERT INTO platform_member_roles VALUES ('member', 'admin')");
    const { salt, hash } = await hashPassword(password);
    await db.execute("INSERT INTO platform_credentials VALUES ('admin', 'user', $1, $2)", [
      salt,
      hash,
    ]);
    const api = request(app.getHttpServer());
    const post = (path: string) => api.post('/api/platform' + path).set('Origin', origin);
    const get = (path: string) => api.get('/api/platform' + path);
    const login = await post('/login').send({ username: 'admin', password }).expect(200);
    const cookie = (response: typeof login) =>
      String(response.headers['set-cookie']?.[0]).split(';')[0]!;
    const builtin = cookie(login);
    const state = (response: typeof login) => new URL(response.body.url).searchParams.get('state')!;
    const callback = (value: string, credential: string) =>
      get('/github/callback').query({ state: value, code: 'test-code' }).set('Cookie', credential);
    let upstreamDenied = false;
    let holdIdentity: Promise<void> | undefined;
    let identityRequested: (() => void) | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === 'https://github.com/login/oauth/access_token') {
          const body = new URLSearchParams(String(init?.body));
          expect(body.get('code_verifier')).toMatch(/^[\w-]{43}$/);
          return Response.json({ access_token: 'test-token' });
        }
        expect(url).toBe('https://api.github.com/user');
        if (upstreamDenied) return new Response(null, { status: 401 });
        if (holdIdentity) {
          identityRequested?.();
          await holdIdentity;
        }
        return Response.json({ id: 4242, login: 'octocat' });
      }),
    );
    const startLogin = () => post('/github/login').send({}).expect(200);
    const startBind = () =>
      post('/github/bind').set('Cookie', builtin).send({ password }).expect(200);
    const complete = (response: typeof login, credential: string, result: string) =>
      callback(state(response), credential)
        .expect(303)
        .expect('Location', '/?github=' + result);
    const unbound = await startLogin();
    await complete(unbound, cookie(unbound), 'registration-required');
    await post('/github/bind')
      .set('Cookie', builtin)
      .send({ password: 'incorrect-password' })
      .expect(401);
    const bind = await startBind();
    await complete(bind, cookie(unbound), 'invalid');
    const concurrent = await Promise.all([
      callback(state(bind), builtin).expect(303),
      callback(state(bind), builtin).expect(303),
    ]);
    expect(concurrent.map((reply) => reply.headers.location).sort()).toEqual([
      '/?github=bound',
      '/?github=invalid',
    ]);
    await complete(bind, builtin, 'invalid');
    await db.execute("INSERT INTO platform_users VALUES ('second', 1)");
    await db.execute("INSERT INTO platform_members VALUES ('second-member', 'second', $1, 1)", [
      defaultSpaceId,
    ]);
    await db.execute("INSERT INTO platform_member_roles VALUES ('second-member', 'admin')");
    await db.execute("INSERT INTO platform_credentials VALUES ('second', 'second', $1, $2)", [
      salt,
      hash,
    ]);
    const second = cookie(await post('/login').send({ username: 'second', password }).expect(200));
    const contested = await post('/github/bind')
      .set('Cookie', second)
      .send({ password })
      .expect(200);
    await complete(contested, second, 'conflict');
    const loggedOut = await post('/github/bind')
      .set('Cookie', second)
      .send({ password })
      .expect(200);
    await post('/logout').set('Cookie', second).expect(204);
    await complete(loggedOut, second, 'invalid');
    await post('/github/bind').set('Cookie', builtin).send({ password }).expect(409);
    const github = await startLogin();
    const githubCookie = cookie(github);
    const signedIn = await complete(github, githubCookie, 'signed-in');
    expect(signedIn.headers['set-cookie']).toBeUndefined();
    expect((await get('/access').set('Cookie', githubCookie).expect(200)).body).toEqual(login.body);
    const another = await startLogin();
    await complete(another, cookie(another), 'signed-in');
    upstreamDenied = true;
    const denied = await startLogin();
    await complete(denied, cookie(denied), 'unavailable');
    await get('/access').set('Cookie', githubCookie).expect(200);
    upstreamDenied = false;
    await db.execute("UPDATE platform_members SET active = 0 WHERE member_id = 'member'");
    await get('/access').set('Cookie', githubCookie).expect(403);
    await db.execute("UPDATE platform_members SET active = 1 WHERE member_id = 'member'");
    await post('/github/unbind')
      .set('Cookie', githubCookie)
      .send({ password: 'incorrect-password' })
      .expect(401);
    const expired = await startLogin();
    await db.execute('UPDATE platform_github_flows SET expires_at = 0');
    await complete(expired, cookie(expired), 'invalid');
    const cancelled = await startLogin();
    await get('/github/callback')
      .query({ state: state(cancelled), error: 'access_denied' })
      .set('Cookie', cookie(cancelled))
      .expect(303)
      .expect('Location', '/?github=cancelled');
    const switched = await startLogin();
    const switchedCookie = cookie(switched);
    const replacement = await post('/login')
      .set('Cookie', switchedCookie)
      .send({ username: 'admin', password })
      .expect(200);
    await complete(switched, switchedCookie, 'invalid');
    await get('/access').set('Cookie', cookie(replacement)).expect(200);
    const late = await startLogin();
    let releaseIdentity!: () => void;
    holdIdentity = new Promise<void>((resolve) => {
      releaseIdentity = resolve;
    });
    const waiting = new Promise<void>((resolve) => {
      identityRequested = resolve;
    });
    const lateCallback = complete(late, cookie(late), 'invalid').then(() => {});
    try {
      await Promise.race([
        waiting,
        lateCallback.then(() => {
          throw new Error('Callback skipped identity');
        }),
      ]);
      holdIdentity = undefined;
      const unboundResponse = await post('/github/unbind')
        .set('Cookie', githubCookie)
        .send({ password })
        .expect(204);
      expect(unboundResponse.headers['set-cookie']).toBeUndefined();
      await get('/access').set('Cookie', githubCookie).expect(401);
      await get('/access').set('Cookie', cookie(another)).expect(401);
      await get('/access').set('Cookie', builtin).expect(200);
      await complete(await startBind(), builtin, 'bound');
    } finally {
      releaseIdentity();
      await lateCallback;
    }
    await get('/access').set('Cookie', cookie(late)).expect(401);
    await get('/access').set('Cookie', githubCookie).expect(401);
    vi.stubEnv('PLATFORM_GITHUB_CLIENT_SECRET', '');
    expect((await get('/github/enabled').expect(200)).body).toEqual({ enabled: false });
    await post('/github/login').send({}).expect(503);
    await post('/github/unbind').set('Cookie', builtin).send({ password }).expect(204);
    await get('/access').set('Cookie', builtin).expect(200);
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    await app.close();
  }
});
