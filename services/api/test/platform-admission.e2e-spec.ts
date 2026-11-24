import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { defaultSpaceId, hashPassword } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { GitHubProvider } from '../src/platform/github-provider.js';
const origin = 'http://127.0.0.1:3200';
const password = 'admission-local-password';
it('separates account sessions from team access and consumes browser-bound registration once', async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  let identity = { id: '42', login: 'new-octocat' };
  const provider = {
    enabled: true,
    authorize: (state: string) => 'https://github.com/login/oauth/authorize?state=' + state,
    identify: vi.fn(async () => identity),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(GitHubProvider)
    .useValue(provider)
    .compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    const db = module.get(PlatformDatabase).executor;
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    const api = request(app.getHttpServer());
    const post = (path: string) => api.post('/api/platform' + path).set('Origin', origin);
    const get = (path: string) => api.get('/api/platform' + path);
    const start = async () => {
      const response = await post('/github/login').send({}).expect(200);
      return {
        cookie: String(response.headers['set-cookie']?.[0]).split(';')[0]!,
        state: new URL(response.body.url).searchParams.get('state')!,
      };
    };
    const complete = (flow: Awaited<ReturnType<typeof start>>, result = 'registration-required') =>
      get('/github/callback')
        .set('Cookie', flow.cookie)
        .query({ state: flow.state, code: 'test' })
        .expect(303)
        .expect('Location', '/?github=' + result);
    const original = await start();
    await complete(original);
    await get('/account').set('Cookie', original.cookie).expect(401);
    expect(
      (await get('/github/registration').set('Cookie', original.cookie).expect(200)).body.login,
    ).toBe('new-octocat');
    await get('/github/registration').expect(401);
    await api
      .post('/api/platform/github/register')
      .set('Cookie', original.cookie)
      .send({})
      .expect(403);
    const account = (
      await post('/github/register')
        .set('Cookie', original.cookie)
        .send({ userId: 'attacker', roles: ['admin'] })
        .expect(200)
    ).body;
    expect(account).toMatchObject({
      username: null,
      githubLogin: 'new-octocat',
      hasPassword: false,
      membership: { status: 'none', permissions: [] },
    });
    expect(account.userId).not.toBe('attacker');
    expect((await db.one('SELECT count(*) AS n FROM platform_members', []))?.n).toBe(0);
    expect(
      (await post('/github/register').set('Cookie', original.cookie).expect(200)).body.userId,
    ).toBe(account.userId);
    await get('/github/registration').set('Cookie', original.cookie).expect(401);
    await get('/account').set('Cookie', original.cookie).expect(200);
    for (const path of [
      '/access',
      '/forms',
      '/catalog/materials',
      '/catalog/functions',
      '/members',
    ])
      await get(path).set('Cookie', original.cookie).expect(403);
    await post('/forms')
      .set('Cookie', original.cookie)
      .set('Idempotency-Key', 'no-member')
      .send({ name: 'denied' })
      .expect(403);
    await get('/github/binding').set('Cookie', original.cookie).expect(200);
    await post('/github/unbind').set('Cookie', original.cookie).send({ password }).expect(409);
    const relogin = await start();
    await complete(relogin, 'signed-in');
    expect((await get('/account').set('Cookie', relogin.cookie).expect(200)).body.userId).toBe(
      account.userId,
    );
    await db.execute('INSERT INTO platform_members VALUES ($1, $2, $3, 1)', [
      'member',
      account.userId,
      defaultSpaceId,
    ]);
    await db.execute('INSERT INTO platform_member_roles VALUES ($1, $2)', ['member', 'viewer']);
    await get('/access').set('Cookie', original.cookie).expect(200);
    expect(
      (await get('/account').set('Cookie', original.cookie).expect(200)).body.membership.status,
    ).toBe('active');
    await db.execute('UPDATE platform_members SET active=0 WHERE member_id=$1', ['member']);
    expect(
      (await get('/account').set('Cookie', original.cookie).expect(200)).body.membership.status,
    ).toBe('suspended');
    await get('/forms').set('Cookie', original.cookie).expect(403);
    await get('/github/binding').set('Cookie', original.cookie).expect(200);
    const suspended = await start();
    await complete(suspended, 'signed-in');
    const credential = await hashPassword(password);
    await db.execute('INSERT INTO platform_credentials VALUES ($1,$2,$3,$4)', [
      'existing',
      account.userId,
      credential.salt,
      credential.hash,
    ]);
    const builtin = await post('/login').send({ username: 'existing', password }).expect(200);
    const builtinCookie = String(builtin.headers['set-cookie']?.[0]).split(';')[0]!;
    await post('/password')
      .set('Cookie', builtinCookie)
      .send({ currentPassword: password, password: 'admission-changed-password' })
      .expect(200);
    await get('/account').set('Cookie', builtinCookie).expect(200);
    await get('/account').set('Cookie', original.cookie).expect(401);
    // An unlink between login start and callback must not create a registration.
    const late = await start();
    await post('/github/unbind')
      .set('Cookie', builtinCookie)
      .send({ password: 'admission-changed-password' })
      .expect(204);
    await complete(late, 'invalid');
    await get('/github/registration').set('Cookie', late.cookie).expect(401);
    identity = { id: '100', login: 'racing-user' };
    const one = await start();
    const two = await start();
    await complete(one);
    await complete(two);
    const race = await Promise.all(
      [one, two].map((flow) => post('/github/register').set('Cookie', flow.cookie).send({})),
    );
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(
      (
        await db.one('SELECT count(*) AS n FROM platform_github_bindings WHERE github_id=$1', [
          '100',
        ])
      )?.n,
    ).toBe(1);
    identity = { id: '101', login: 'expired-user' };
    const expired = await start();
    await complete(expired);
    await db.execute('UPDATE platform_github_registrations SET expires_at=0');
    await post('/github/register').set('Cookie', expired.cookie).expect(401);
    expect(
      (
        await db.one('SELECT count(*) AS n FROM platform_github_bindings WHERE github_id=$1', [
          '101',
        ])
      )?.n,
    ).toBe(0);
    const cancel = await start();
    await complete(cancel);
    await post('/logout').set('Cookie', cancel.cookie).expect(204);
    await post('/github/register').set('Cookie', cancel.cookie).expect(401);
    const callbackCancel = await start();
    await get('/github/callback')
      .set('Cookie', callbackCancel.cookie)
      .query({ state: callbackCancel.state, error: 'access_denied' })
      .expect(303)
      .expect('Location', '/?github=cancelled');
    await get('/github/registration').set('Cookie', callbackCancel.cookie).expect(401);
    const changed = await start();
    await complete(changed);
    await db.execute(
      'INSERT INTO platform_github_bindings (user_id,github_id,github_login) VALUES ($1,$2,$3)',
      [account.userId, identity.id, identity.login],
    );
    await post('/github/register').set('Cookie', changed.cookie).expect(409);
    await db.execute('UPDATE platform_users SET active=0 WHERE user_id=$1', [account.userId]);
    await get('/account').set('Cookie', builtinCookie).expect(401);
    await db.execute('INSERT INTO platform_users VALUES ($1,1)', ['no-member-builtin']);
    await db.execute('INSERT INTO platform_credentials VALUES ($1,$2,$3,$4)', [
      'no-member',
      'no-member-builtin',
      credential.salt,
      credential.hash,
    ]);
    const detached = await post('/login').send({ username: 'no-member', password }).expect(200);
    const detachedCookie = String(detached.headers['set-cookie']?.[0]).split(';')[0]!;
    await post('/password')
      .set('Cookie', detachedCookie)
      .send({ currentPassword: password, password: 'standalone-updated-password' })
      .expect(200);
    await get('/account').set('Cookie', detachedCookie).expect(200);
    await get('/access').set('Cookie', detachedCookie).expect(403);
    const audit = await db.many('SELECT state FROM platform_account_changes WHERE user_id=$1', [
      'no-member-builtin',
    ]);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain('standalone-updated-password');
    // The bounded login attempt limit also bounds anonymous registration proof creation.
    let limited = false;
    for (let i = 0; i < 31; i++) {
      const response = await post('/github/login').send({});
      if (response.status === 429) {
        limited = true;
        break;
      }
      expect(response.status).toBe(200);
    }
    expect(limited).toBe(true);
  } finally {
    vi.unstubAllEnvs();
    await app.close();
  }
});
