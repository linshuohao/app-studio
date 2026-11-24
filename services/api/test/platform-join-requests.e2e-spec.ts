import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
const origin = 'http://127.0.0.1:3200';
it('serializes application, withdrawal and approval with current account and administrator authorization', async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    const db = module.get(PlatformDatabase).executor;
    const access = module.get(PlatformAccess);
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    const cookies: Record<string, string> = {};
    for (const id of ['admin', 'admin2', 'a', 'b', 'c', 'd', 'e', 'f']) {
      await db.execute('INSERT INTO platform_users VALUES ($1,1)', [id]);
      if (id.startsWith('admin')) {
        await db.execute('INSERT INTO platform_members VALUES ($1,$2,$3,1)', [
          id,
          id,
          defaultSpaceId,
        ]);
        await db.execute('INSERT INTO platform_member_roles VALUES ($1,$2)', [id, 'admin']);
      }
      cookies[id] = 'platform-session=' + (await access.issueSession(id, 'test')).token;
    }
    await db.execute(
      'INSERT INTO platform_github_bindings (user_id,github_id,github_login) VALUES ($1,$2,$3)',
      ['a', 'gh-a', 'applicant-a'],
    );
    const api = request(app.getHttpServer());
    const post = (path: string, user: string, body: Record<string, unknown> = {}) =>
      api
        .post('/api/platform' + path)
        .set('Origin', origin)
        .set('Cookie', cookies[user]!)
        .send(body);
    const get = (path: string, user: string) =>
      api.get('/api/platform' + path).set('Cookie', cookies[user]!);
    const create = (user: string, explanation = 'Please let me join') =>
      post('/join-requests', user, { explanation });
    const decision = (id: string, user: string, body: Record<string, unknown>) =>
      post('/join-requests/' + id + '/decision', user, body);
    const withdraw = (id: string, user: string, revision = 0) =>
      post('/join-requests/' + id + '/withdraw', user, { revision });
    expect((await get('/join-requests/mine', 'a').expect(200)).body).toEqual({ request: null });
    await create('a', ' ').expect(400);
    await create('a', 'a\0b').expect(400);
    await create('a', 'a'.repeat(1001)).expect(400);
    await api
      .post('/api/platform/join-requests')
      .set('Cookie', cookies.a!)
      .send({ explanation: 'a' })
      .expect(403);
    const first = (await create('a').expect(200)).body;
    expect(first).toMatchObject({
      status: 'pending',
      revision: 0,
      githubLogin: 'applicant-a',
      roles: [],
    });
    expect((await create('a', 'changed explanation').expect(200)).body).toEqual(first);
    await withdraw(first.requestId, 'b').expect(404);
    await get('/join-requests', 'a').expect(403);
    await get('/join-requests/' + first.requestId, 'a').expect(403);
    expect((await get('/join-requests/' + first.requestId, 'admin').expect(200)).body).toEqual(
      first,
    );
    await get('/join-requests/nonexistent', 'admin').expect(404);
    await decision(first.requestId, 'a', {
      revision: 0,
      decision: 'approve',
      roles: ['admin'],
    }).expect(403);
    const list = (await get('/join-requests?limit=1&offset=0', 'admin').expect(200)).body;
    expect(list).toMatchObject({ total: 1, limit: 1, offset: 0 });
    expect(list.items[0].requestId).toBe(first.requestId);
    for (const query of [
      'limit=0',
      'limit=101',
      'offset=-1',
      'offset=abc',
      'status=bogus',
      'limit=1&limit=2',
    ])
      await get('/join-requests?' + query, 'admin').expect(400);
    await decision(first.requestId, 'admin', {
      revision: 9,
      decision: 'approve',
      roles: ['viewer'],
    }).expect(409);
    await decision(first.requestId, 'admin', {
      revision: 0,
      decision: 'approve',
      roles: [],
    }).expect(400);
    await decision(first.requestId, 'admin', {
      revision: 0,
      decision: 'approve',
      roles: ['owner'],
    }).expect(400);
    await decision(first.requestId, 'admin', {
      revision: 0,
      decision: 'reject',
      reason: ' ',
    }).expect(400);
    await decision(first.requestId, 'admin', {
      revision: 0,
      decision: 'reject',
      reason: 'a\0b',
    }).expect(400);
    await decision(first.requestId, 'admin', {
      revision: 0,
      decision: 'reject',
      reason: 'Please provide more details',
    }).expect(200);
    const second = (await create('a', 'More details').expect(200)).body;
    expect(second.requestId).not.toBe(first.requestId);
    await withdraw(second.requestId, 'a').expect(200);
    expect((await get('/join-requests/mine', 'a').expect(200)).body.request.status).toBe(
      'withdrawn',
    );
    const third = (await create('a').expect(200)).body;
    const approvals = await Promise.all([
      decision(third.requestId, 'admin', {
        revision: 0,
        decision: 'approve',
        roles: ['editor', 'publisher'],
      }),
      decision(third.requestId, 'admin2', {
        revision: 0,
        decision: 'reject',
        reason: 'Competing decision',
      }),
    ]);
    expect(approvals.map((r) => r.status).sort()).toEqual([200, 409]);
    // Whichever transaction wins is final; if rejected, explicitly reapply and approve.
    if (approvals[0]!.status !== 200) {
      const again = (await create('a').expect(200)).body;
      await decision(again.requestId, 'admin', {
        revision: 0,
        decision: 'approve',
        roles: ['editor', 'publisher'],
      }).expect(200);
    }
    expect((await get('/account', 'a').expect(200)).body.membership.status).toBe('active');
    expect((await get('/access', 'a').expect(200)).body.permissions).toEqual(
      expect.arrayContaining(['form:edit', 'form:publish']),
    );
    const members = (await get('/members', 'admin').expect(200)).body;
    expect(members.find((m: { userId: string }) => m.userId === 'a').githubLogin).toBe(
      'applicant-a',
    );
    await create('a').expect(409);
    await db.execute('UPDATE platform_members SET active=0 WHERE user_id=$1', ['a']);
    await create('a').expect(409);
    expect((await get('/account', 'a').expect(200)).body.membership.status).toBe('suspended');
    const b = (await create('b').expect(200)).body;
    const race = await Promise.all([
      withdraw(b.requestId, 'b'),
      decision(b.requestId, 'admin', { revision: 0, decision: 'approve', roles: ['viewer'] }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const bFinal = (await get('/join-requests/mine', 'b').expect(200)).body.request;
    const bMember = await db.one('SELECT 1 FROM platform_members WHERE user_id=$1', ['b']);
    expect(Boolean(bMember)).toBe(bFinal.status === 'approved');
    const c = (await create('c').expect(200)).body;
    await db.execute('DELETE FROM platform_member_roles WHERE member_id=$1', ['admin2']);
    await decision(c.requestId, 'admin2', {
      revision: 0,
      decision: 'approve',
      roles: ['viewer'],
    }).expect(403);
    await db.execute('UPDATE platform_users SET active=0 WHERE user_id=$1', ['c']);
    await decision(c.requestId, 'admin', {
      revision: 0,
      decision: 'approve',
      roles: ['viewer'],
    }).expect(409);
    await db.execute('UPDATE platform_users SET active=1 WHERE user_id=$1', ['c']);
    await db.execute(
      "CREATE FUNCTION reject_join_audit_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF (NEW.state::jsonb ->> 'action')='approve-join-request' THEN RAISE EXCEPTION 'injected join audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_join_audit BEFORE INSERT ON platform_member_changes FOR EACH ROW EXECUTE FUNCTION reject_join_audit_fn()",
    );
    await decision(c.requestId, 'admin', {
      revision: 0,
      decision: 'approve',
      roles: ['viewer'],
    }).expect(500);
    expect(
      (await db.one('SELECT status FROM platform_join_requests WHERE request_id=$1', [c.requestId]))
        ?.status,
    ).toBe('pending');
    expect(await db.one('SELECT 1 FROM platform_members WHERE user_id=$1', ['c'])).toBeUndefined();
    await db.execute('DROP TRIGGER reject_join_audit ON platform_member_changes');
    await decision(c.requestId, 'admin', {
      revision: 0,
      decision: 'approve',
      roles: ['viewer'],
    }).expect(200);
    expect(
      (
        await db.one(
          "SELECT COUNT(*) AS n FROM platform_member_changes WHERE (state::jsonb ->> 'requestId')=$1",
          [c.requestId],
        )
      )?.n,
    ).toBe(1);
    const e = (await create('e').expect(200)).body;
    await db.execute('INSERT INTO platform_members VALUES ($1,$2,$3,0)', [
      'e',
      'e',
      defaultSpaceId,
    ]);
    await decision(e.requestId, 'admin', {
      revision: 0,
      decision: 'approve',
      roles: ['viewer'],
    }).expect(409);
    for (let n = 0; n < 10; n++) {
      const row = (await create('d').expect(200)).body;
      await create('d').expect(200);
      await withdraw(row.requestId, 'd').expect(200);
    }
    await create('d').expect(429);
    const all = (await get('/join-requests?status=all&limit=100', 'admin').expect(200)).body;
    expect(all.total).toBeGreaterThan(10);
    expect(
      all.items.some(
        (row: { requestId: string; status: string }) =>
          row.requestId === first.requestId && row.status === 'rejected',
      ),
    ).toBe(true);
  } finally {
    vi.unstubAllEnvs();
    await app.close();
  }
});
