import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { GitHubAccess } from '../src/platform/github-access.js';
import { PlatformAccess } from '../src/platform/access.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
it('serves installed catalogs and atomically manages members with current authorization', async () => {
  const origin = 'http://127.0.0.1:3200';
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    const db = module.get(PlatformDatabase).executor;
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    for (const [id, role] of [
      ['a', 'admin'],
      ['b', 'admin'],
      ['v', 'viewer'],
      ['e', 'editor'],
      ['n', null],
    ]) {
      await db.execute('INSERT INTO platform_users VALUES ($1,1)', [id!]);
      await db.execute('INSERT INTO platform_credentials VALUES ($1,$2,$3,$4)', [
        id!,
        id!,
        'unused',
        'unused',
      ]);
      if (role) {
        await db.execute('INSERT INTO platform_members VALUES ($1,$2,$3,1)', [
          id!,
          id!,
          defaultSpaceId,
        ]);
        await db.execute('INSERT INTO platform_member_roles VALUES ($1,$2)', [id!, role]);
      }
    }
    const access = module.get(PlatformAccess);
    const cookies = Object.fromEntries(
      await Promise.all(
        ['a', 'b', 'v', 'e'].map(async (id) => [
          id,
          `platform-session=${(await access.issueSession(id, 'test')).token}`,
        ]),
      ),
    );
    const api = request(app.getHttpServer());
    const get = (path: string, who = 'a') =>
      api.get('/api/platform' + path).set('Cookie', cookies[who]!);
    const post = (path: string, body: object, who = 'a') =>
      api
        .post('/api/platform' + path)
        .set('Cookie', cookies[who]!)
        .set('Origin', origin)
        .send(body);
    await api.get('/api/platform/catalog/materials').expect(401);
    const materialList = (await get('/catalog/materials', 'v').expect(200)).body;
    expect(materialList.length).toBeGreaterThan(10);
    for (const row of materialList) {
      expect(row.implementation).toBe('React');
      expect(row.category).not.toBe('未分类');
      const asset = (await get(`/catalog/materials/${row.id}`, 'v').expect(200)).body;
      expect(asset.preview, row.id).toBeDefined();
      expect(asset.preview.prepared.definition.id).toBe('material-gallery');
    }
    expect((await get('/catalog/functions?q=JavaScript').expect(200)).body.length).toBeGreaterThan(
      10,
    );
    const detail = (await get('/catalog/materials/remote-select').expect(200)).body;
    expect(detail.manifest.requests.search).toBeDefined();
    expect(detail.artifact.digest).toMatch(/^sha256:/);
    expect(detail.documentation.examples[0].value.requests.search.type).toBe('host.request');
    expect(
      (await get('/catalog/functions/core.add').expect(200)).body.manifest.parameters,
    ).toHaveLength(2);
    await get('/catalog/materials/text-input?version=missing').expect(404);
    await get('/catalog/materials/__proto__').expect(404);
    await get('/catalog/unknown').expect(404);
    await get('/catalog/materials?q=a&q=b').expect(400);
    await get('/catalog/materials/text-input?version=').expect(400);
    await get('/catalog/materials/text-input?version=a&version=b').expect(400);
    expect((await get('/catalog/materials?q=not-an-asset').expect(200)).body).toEqual([]);
    await get('/members', 'v').expect(403);
    await post('/members/b', { revision: 0, roles: ['viewer'], active: true }, 'e').expect(403);
    await api
      .post('/api/platform/members/b')
      .set('Cookie', cookies.a!)
      .send({ revision: 0, roles: ['viewer'], active: true })
      .expect(403);
    await post('/members/b', { revision: 0, roles: ['invalid'], active: true }).expect(400);
    await post('/members/b', { revision: 0, roles: ['viewer', 'viewer'], active: true }).expect(
      400,
    );
    const demoted = (
      await post('/members/b', {
        revision: 0,
        roles: ['editor', 'publisher'],
        active: true,
      }).expect(201)
    ).body;
    expect((await access.authenticate(cookies.b!.split('=')[1])).permissions).toEqual(
      expect.arrayContaining(['form:edit', 'form:publish']),
    );
    await post('/members/b', { revision: 0, roles: ['admin'], active: true }).expect(409);
    await post('/members/a', { revision: 0, roles: ['viewer'], active: true }).expect(409);
    await post('/members/a', { revision: 0, roles: ['admin'], active: false }).expect(409);
    const stopped = (
      await post('/members/b', {
        revision: demoted.revision,
        roles: ['publisher'],
        active: false,
      }).expect(201)
    ).body;
    await get('/catalog/materials', 'b').expect(403);
    await post('/members/b', {
      revision: stopped.revision,
      roles: ['viewer'],
      active: true,
    }).expect(201);
    await get('/catalog/materials', 'b').expect(200);
    const added = (await post('/members', { username: 'n', roles: ['viewer'] }).expect(201)).body;
    expect(added.username).toBe('n');
    await post('/members', { username: 'n', roles: ['viewer'] }).expect(409);
    await post('/members', { username: 'missing', roles: ['viewer'] }).expect(404);
    expect((await db.one('SELECT COUNT(*) AS count FROM platform_member_changes', []))?.count).toBe(
      4,
    );
    const audit = await db.one(
      'SELECT state FROM platform_member_changes ORDER BY sequence LIMIT 1',
      [],
    );
    expect(JSON.parse(String(audit?.state))).toMatchObject({
      before: { roles: ['admin'], active: true },
      after: { roles: ['editor', 'publisher'], active: true },
      result: 'success',
    });
    const newBody = {
      username: 'created',
      roles: ['editor'],
      createAccount: true,
      identityVerified: true,
      password: 'initial-member-password',
    };
    await post('/members', { ...newBody, identityVerified: false }).expect(400);
    await post('/members', { ...newBody, password: 'short' }).expect(400);
    await post('/members', newBody, 'v').expect(403);
    const creation = (await post('/members', newBody).expect(201)).body;
    expect(JSON.stringify(creation)).not.toContain(newBody.password);
    await post('/members', newBody).expect(409);
    const beforeCounts = (await db.one('SELECT COUNT(*) AS count FROM platform_users', []))?.count;
    await post('/members', newBody).expect(409);
    expect((await db.one('SELECT COUNT(*) AS count FROM platform_users', []))?.count).toBe(
      beforeCounts,
    );
    const firstSession = await access.login('created', newBody.password);
    const otherSession = await access.login('created', newBody.password);
    cookies.created = `platform-session=${firstSession.token}`;
    await post(
      '/password',
      { currentPassword: 'wrong', password: 'changed-member-password' },
      'created',
    ).expect(401);
    await post(
      '/password',
      { currentPassword: newBody.password, password: 'changed-member-password' },
      'created',
    ).expect(200);
    await get('/access', 'created').expect(200);
    await expect(access.authenticate(otherSession.token)).rejects.toThrow();
    await expect(access.login('created', newBody.password)).rejects.toThrow();
    await expect(access.login('created', 'changed-member-password')).resolves.toHaveProperty(
      'token',
    );
    expect(
      String(
        (
          await db.one('SELECT password_hash FROM platform_credentials WHERE username=$1', [
            'created',
          ])
        )?.password_hash,
      ),
    ).not.toBe('changed-member-password');
    const originalVerify = access.verifyCurrentPassword.bind(access);
    vi.spyOn(access, 'verifyCurrentPassword').mockImplementationOnce(async (token, password) => {
      const proof = await originalVerify(token, password);
      await access.changePassword(token, password, 'rotated-member-password');
      return proof;
    });
    await expect(
      module.get(GitHubAccess).unbind(firstSession.token, 'changed-member-password'),
    ).rejects.toThrow('Credentials changed');
    vi.restoreAllMocks();
    const auditText = JSON.stringify(
      await db.many('SELECT state FROM platform_member_changes', []),
    );
    expect(auditText).not.toContain(newBody.password);
    expect(auditText).not.toContain('rotated-member-password');
    const currentB = (await get('/members').expect(200)).body.find(
      (row: { memberId: string }) => row.memberId === 'b',
    );
    const restored = (
      await post('/members/b', {
        revision: currentB.revision,
        roles: ['admin'],
        active: true,
      }).expect(201)
    ).body;
    const competing = await Promise.all([
      post('/members/a', { revision: 0, roles: ['viewer'], active: true }, 'a'),
      post('/members/b', { revision: restored.revision, roles: ['viewer'], active: true }, 'b'),
    ]);
    expect(competing.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(
      await db.many(
        "SELECT conname FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f' AND NOT convalidated",
      ),
    ).toEqual([]);
  } finally {
    await app.close();
    vi.unstubAllEnvs();
  }
});
