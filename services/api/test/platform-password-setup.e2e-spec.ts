import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { hashPassword } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { GitHubAccess } from '../src/platform/github-access.js';
import { GitHubProvider } from '../src/platform/github-provider.js';
const origin = 'http://127.0.0.1:3200';
const password = 'setup-local-password';
it('requires purpose-bound GitHub reverification and atomically establishes the first password', async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  let identity = { id: 'a', login: 'github-a' };
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
    const access = module.get(PlatformAccess);
    const github = module.get(GitHubAccess);
    const cookieFor = async (id: string) =>
      'platform-session=' +
      (
        await access.issueSession(
          id,
          'github:' +
            (
              await db.one(
                'SELECT sequence FROM platform_github_bindings WHERE user_id=$1 AND revoked_at IS NULL',
                [id],
              )
            )?.sequence,
        )
      ).token;
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      await db.execute('INSERT INTO platform_users VALUES ($1,1)', [id]);
      await db.execute(
        'INSERT INTO platform_github_bindings (user_id,github_id,github_login) VALUES ($1,$2,$3)',
        [id, id, 'github-' + id],
      );
    }
    const a = await cookieFor('a');
    const otherA = await cookieFor('a');
    const b = await cookieFor('b');
    const c = await cookieFor('c');
    const d = await cookieFor('d');
    const e = await cookieFor('e');
    const f = await cookieFor('f');
    const g = await cookieFor('g');
    const api = request(app.getHttpServer());
    const post = (path: string, cookie: string, body: Record<string, unknown> = {}) =>
      api
        .post('/api/platform' + path)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send(body);
    const get = (path: string, cookie: string) =>
      api.get('/api/platform' + path).set('Cookie', cookie);
    const start = async (cookie: string) =>
      new URL((await post('/github/password-setup', cookie).expect(200)).body.url).searchParams.get(
        'state',
      )!;
    const complete = (state: string, cookie: string, result = 'password-setup-verified') =>
      get('/github/callback', cookie)
        .query({ state, code: 'test' })
        .expect(303)
        .expect('Location', '/?github=' + result);
    const setup = (cookie: string, username: string) =>
      post('/account/password/setup', cookie, { username, password });
    expect((await get('/account/password/setup', a).expect(200)).body).toMatchObject({
      verified: false,
      hasPassword: false,
      githubLogin: 'github-a',
      expiresAt: null,
    });
    await setup(a, 'alice').expect(403);
    await post('/github/unbind', a, { password }).expect(409);
    await api.post('/api/platform/github/password-setup').set('Cookie', a).send({}).expect(403);
    const wrong = await start(a);
    identity = { id: 'b', login: 'github-b' };
    await complete(wrong, a, 'conflict');
    await setup(a, 'alice').expect(403);
    identity = { id: 'a', login: 'github-a' };
    const proof = await start(a);
    await complete(proof, otherA, 'invalid');
    await complete(proof, a);
    await complete(proof, a, 'invalid');
    expect((await get('/account/password/setup', a).expect(200)).body.verified).toBe(true);
    expect((await get('/account/password/setup', otherA).expect(200)).body.verified).toBe(false);
    await setup(otherA, 'other-alice').expect(403);
    await post('/account/password/setup', a, { username: 'alice', password: 'short' }).expect(400);
    const credential = await hashPassword(password);
    await db.execute('INSERT INTO platform_credentials VALUES ($1,$2,$3,$4)', [
      'taken',
      'b',
      credential.salt,
      credential.hash,
    ]);
    await setup(a, 'taken').expect(409);
    expect((await get('/account/password/setup', a).expect(200)).body.verified).toBe(true);
    const race = await Promise.all([setup(a, 'alice'), setup(a, 'second-alice')]);
    expect(race.map((reply) => reply.status).sort()).toEqual([200, 409]);
    const account = (await get('/account', a).expect(200)).body;
    expect(account.hasPassword).toBe(true);
    expect(['alice', 'second-alice']).toContain(account.username);
    await get('/account', otherA).expect(401);
    await get('/access', a).expect(403);
    await setup(a, 'overwrite').expect(409);
    await post('/github/password-setup', a).expect(409);
    expect((await get('/account/password/setup', a).expect(200)).body.verified).toBe(false);
    expect(
      (await db.one('SELECT COUNT(*) AS n FROM platform_credentials WHERE user_id=$1', ['a']))?.n,
    ).toBe(1);
    const audit = await db.many('SELECT state FROM platform_account_changes WHERE user_id=$1', [
      'a',
    ]);
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(password);
    const login = await post('/login', a, { username: account.username, password }).expect(200);
    const builtin = String(login.headers['set-cookie']?.[0]).split(';')[0]!;
    await post('/github/unbind', builtin, { password }).expect(204);
    await get('/account', builtin).expect(200);
    // Expired proofs, logout, changed binding, and invalid account cannot be used.
    identity = { id: 'c', login: 'github-c' };
    await complete(await start(c), c);
    await db.execute('UPDATE platform_password_setup_proofs SET expires_at=0 WHERE user_id=$1', [
      'c',
    ]);
    expect((await get('/account/password/setup', c).expect(200)).body.verified).toBe(false);
    await setup(c, 'charlie').expect(403);
    await complete(await start(c), c);
    await post('/logout', c).expect(204);
    await setup(c, 'charlie').expect(401);
    identity = { id: 'd', login: 'github-d' };
    await complete(await start(d), d);
    await db.execute('UPDATE platform_github_bindings SET revoked_at=$1 WHERE user_id=$2', [
      Date.now(),
      'd',
    ]);
    await db.execute(
      'INSERT INTO platform_github_bindings (user_id,github_id,github_login) VALUES ($1,$2,$3)',
      ['d', 'd', 'github-d'],
    );
    await setup(d, 'delta').expect(403);
    identity = { id: 'e', login: 'github-e' };
    await complete(await start(e), e);
    const pending = github.setupPassword(e.split('=')[1], 'echo', password);
    const pendingFailure = expect(pending).rejects.toThrow();
    await access.revokeSession(e.split('=')[1]);
    await pendingFailure;
    expect(
      await db.one('SELECT 1 FROM platform_credentials WHERE user_id=$1', ['e']),
    ).toBeUndefined();
    identity = { id: 'f', login: 'github-f' };
    await complete(await start(f), f);
    const inactivated = github.setupPassword(f.split('=')[1], 'foxtrot', password);
    const inactiveFailure = expect(inactivated).rejects.toThrow();
    await db.execute('UPDATE platform_users SET active=0 WHERE user_id=$1', ['f']);
    await inactiveFailure;
    expect(
      await db.one('SELECT 1 FROM platform_credentials WHERE user_id=$1', ['f']),
    ).toBeUndefined();
    // Normal login OAuth is not a setup proof.
    identity = { id: 'g', login: 'github-g' };
    const normal = await post('/github/login', '').expect(200);
    const normalCookie = String(normal.headers['set-cookie']?.[0]).split(';')[0]!;
    await complete(new URL(normal.body.url).searchParams.get('state')!, normalCookie, 'signed-in');
    await setup(normalCookie, 'golf').expect(403);
    const expiredFlow = await start(g);
    await db.execute(
      "UPDATE platform_github_flows SET expires_at=0 WHERE purpose='password-setup'",
      [],
    );
    await complete(expiredFlow, g, 'invalid');
    await setup(g, 'golf').expect(403);
    // A new verification invalidates the previous proof and a stale callback cannot revive it.
    const earlier = await start(g);
    const later = await start(g);
    await complete(earlier, g, 'invalid');
    await complete(later, g);
    expect((await get('/account/password/setup', g).expect(200)).body.verified).toBe(true);
    await db.execute(
      "CREATE FUNCTION reject_setup_audit_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (NEW.state::jsonb ->> 'action')='setup-password' THEN RAISE EXCEPTION 'injected setup audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_setup_audit BEFORE INSERT ON platform_account_changes FOR EACH ROW EXECUTE FUNCTION reject_setup_audit_fn()",
    );
    await setup(g, 'golf').expect(500);
    expect(
      await db.one('SELECT 1 FROM platform_credentials WHERE user_id=$1', ['g']),
    ).toBeUndefined();
    expect((await get('/account/password/setup', g).expect(200)).body.verified).toBe(true);
    await get('/account', normalCookie).expect(200);
    await db.execute('DROP TRIGGER reject_setup_audit ON platform_account_changes');
    await start(g);
    await setup(g, 'golf').expect(403);
    // A binding attempt cannot steal a GitHub account with a different platform identity.
    const bind = await post('/github/bind', builtin, { password }).expect(200);
    identity = { id: 'b', login: 'github-b' };
    await complete(new URL(bind.body.url).searchParams.get('state')!, builtin, 'conflict');
    expect((await get('/account', builtin).expect(200)).body.githubLogin).toBe(null);
    expect((await get('/account', b).expect(200)).body.userId).toBe('b');
  } finally {
    vi.unstubAllEnvs();
    await app.close();
  }
});
