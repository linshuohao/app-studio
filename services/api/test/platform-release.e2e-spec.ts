import { Test } from '@nestjs/testing';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { travelDefinition } from '../../../apps/playground/src/demos/travel/definition.js';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { ReleaseBuild } from '../src/platform/release-build.js';
const origin = 'http://127.0.0.1:3200';
const text = JSON.stringify({
  ...travelDefinition,
  views: { desktop: travelDefinition.views.desktop },
});
it('publishes a selected immutable version and recovers a single success after concurrent retry', async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
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
    const access = module.get(PlatformAccess);
    const { token } = await access.issueSession('user', 'integration');
    const api = request(app.getHttpServer());
    const post = (path: string, key: string) =>
      api
        .post('/api/platform' + path)
        .set('Origin', origin)
        .set('Cookie', 'platform-session=' + token)
        .set('Idempotency-Key', key);
    const { formId } = (await post('/forms', 'create').send({ name: '差旅' }).expect(201)).body;
    const base = '/forms/' + formId;
    const { versionId } = (
      await post(base + '/versions', 'v1')
        .send({ text })
        .expect(201)
    ).body;
    const v2 = (
      await post(base + '/versions', 'v2')
        .send({ text: '{' })
        .expect(201)
    ).body.versionId;
    const publish = (id: string, key: string, name?: string) =>
      post(base + '/releases', key).send({ versionId: id, profile: 'desktop', name });
    const get = (path: string) => api.get('/api/platform' + path);
    const [first, retry] = await Promise.all([
      publish(versionId, 'release').expect(201),
      publish(versionId, 'release').expect(201),
    ]);
    expect(first.body).toMatchObject({
      success: true,
      versionId,
      target: { platform: 'web', profile: 'desktop' },
    });
    expect(first.body.releaseId).toEqual(expect.any(String));
    expect(retry.body).toEqual(first.body);
    expect((await publish(v2, 'invalid').expect(201)).body).toMatchObject({
      success: false,
      diagnostics: [{ code: 'JSON_SYNTAX' }],
    });
    expect(await db.many('SELECT version_id FROM platform_releases', [])).toEqual([
      { version_id: versionId },
    ]);
    const deliveryPath = '/releases/' + first.body.releaseId;
    const delivery = (
      await get(deliveryPath)
        .set('Origin', 'https://example.com')
        .expect(200)
        .expect('Cache-Control', 'no-store')
        .expect('Access-Control-Allow-Origin', '*')
    ).body;
    expect(Object.keys(delivery).sort()).toEqual([
      'digest',
      'format',
      'preparedText',
      'releaseId',
      'target',
    ]);
    expect(delivery.digest).toBe(
      'sha256:' + createHash('sha256').update(delivery.preparedText).digest('hex'),
    );
    expect(JSON.parse(delivery.preparedText)).toMatchObject({
      definition: { id: travelDefinition.id },
    });
    const evidencePath = (id: string) => base + '/versions/' + id + '/asset-binding-evidence';
    await get(evidencePath(versionId)).expect(401);
    const readEvidence = (id: string) =>
      get(evidencePath(id))
        .set('Cookie', 'platform-session=' + token)
        .expect(200);
    const { capabilityLock } = JSON.parse(delivery.preparedText);
    expect((await readEvidence(versionId)).body).toEqual({
      unobserved: 'pending',
      profiles: [
        {
          target: { platform: 'web', profile: 'desktop' },
          dependencies: ['materials', 'pureFunctions'].flatMap((kind) =>
            Object.entries(capabilityLock[kind]).map(([id, lock]) => ({
              kind,
              id,
              status: 'recoverable',
              lock,
            })),
          ),
        },
      ],
    });
    expect((await readEvidence(v2)).body).toEqual({ unobserved: 'pending', profiles: [] });
    await get('/releases/missing').expect(404);
    await get(base + '/releases').expect(401);
    await publish(v2, 'release').expect(409);
    const another = (await post('/forms', 'other').send({ name: '其他表单' }).expect(201)).body
      .formId;
    await post('/forms/' + another + '/releases', 'cross')
      .send({ versionId, profile: 'desktop' })
      .expect(404);
    await db.execute("UPDATE platform_member_roles SET role = 'viewer'");
    expect((await publish(versionId, 'release').expect(201)).body).toEqual(first.body);
    await publish(versionId, 'new-viewer').expect(403);
    await db.execute("UPDATE platform_member_roles SET role = 'editor'");
    await publish(versionId, 'new-editor').expect(403);
    await db.execute("UPDATE platform_member_roles SET role = 'publisher'");
    await post(base + '/versions', 'no-edit')
      .send({ text })
      .expect(403);
    await db.execute("UPDATE platform_member_roles SET role = 'admin'");
    const builder = module.get(ReleaseBuild);
    const compile = builder.compile.bind(builder);
    const capture = builder.capture.bind(builder);
    const auditCount = async () =>
      (await db.one('SELECT COUNT(*) AS count FROM platform_release_audit', []))?.count;
    const waitAtCommit = async (
      key: string,
      beforeCommit: () => Promise<unknown>,
      expected: number,
    ) => {
      let continueCommit!: () => void;
      let entered!: () => void;
      const barrier = new Promise<void>((resolve) => {
        continueCommit = resolve;
      });
      const compiled = new Promise<void>((resolve) => {
        entered = resolve;
      });
      vi.spyOn(builder, 'compile').mockImplementationOnce(async (source, inputs) => {
        try {
          const result = await compile(source, inputs);
          entered();
          await barrier;
          return result;
        } catch (error) {
          entered();
          throw error;
        }
      });
      const result = publish(versionId, key)
        .expect(expected)
        .then((response) => response.body);
      await compiled;
      try {
        await beforeCommit();
      } finally {
        continueCommit();
      }
      return result;
    };
    // A separate connection commits revocations/archival before the publish write transaction.
    const concurrentStorage = new PlatformDatabase();
    const concurrent = concurrentStorage.executor;
    try {
      for (const [key, revoke, restore, status] of [
        [
          'disable-account',
          'UPDATE platform_users SET active = 0',
          'UPDATE platform_users SET active = 1',
          401,
        ],
        [
          'disable-member',
          'UPDATE platform_members SET active = 0',
          'UPDATE platform_members SET active = 1',
          403,
        ],
        [
          'revoke-role',
          "UPDATE platform_member_roles SET role = 'viewer'",
          "UPDATE platform_member_roles SET role = 'admin'",
          403,
        ],
        [
          'archive-first',
          'UPDATE platform_forms SET archived = 1',
          'UPDATE platform_forms SET archived = 0',
          409,
        ],
      ] as const) {
        await waitAtCommit(key, async () => await concurrent.execute(revoke), status);
        expect(await auditCount()).toBe(1);
        expect((await get(deliveryPath).expect(200)).body).toEqual(delivery);
        await concurrent.execute(restore);
      }
    } finally {
      await concurrentStorage.onModuleDestroy();
    }
    await db.execute(
      `CREATE FUNCTION reject_release_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected release audit failure'; END $$; CREATE TRIGGER reject_release BEFORE INSERT ON platform_release_audit FOR EACH ROW EXECUTE FUNCTION reject_release_fn()`,
    );
    await publish(versionId, 'recover', '首版发布').expect(500);
    expect(await auditCount()).toBe(1);
    expect((await db.one('SELECT COUNT(*) AS n FROM platform_releases', []))?.n).toBe(1);
    await db.execute('DROP TRIGGER reject_release ON platform_release_audit');
    const newCapture = vi.spyOn(builder, 'capture').mockImplementation(() => {
      throw new Error('A retry must use the persisted build snapshot');
    });
    const recovered = (await publish(versionId, 'recover', '首版发布').expect(201)).body;
    expect(recovered.success).toBe(true);
    expect(recovered.name).toBe('首版发布');
    expect((await get('/releases/' + recovered.releaseId).expect(200)).body.name).toBe('首版发布');
    await publish(versionId, 'recover', '改名后的请求').expect(409);
    await publish(versionId, 'oversize-name', 'x'.repeat(81)).expect(400);
    await publish(versionId, 'multiline-name', 'a\nb').expect(400);
    await publish(versionId, 'unicode-line-name', 'a\u2028b').expect(400);
    await publish(versionId, 'control-name', 'a\u0000b').expect(400);
    expect(newCapture).not.toHaveBeenCalled();
    newCapture.mockRestore();
    vi.spyOn(builder, 'capture').mockImplementationOnce((target) => ({
      ...capture(target),
      compiler: 'missing-compiler-build',
    }));
    await publish(versionId, 'missing-build').expect(503);
    await publish(versionId, 'missing-build').expect(503);
    expect(await auditCount()).toBe(2);
    const afterLogout = await waitAtCommit('logout', () => access.revokeSession(token), 201);
    expect(afterLogout.success).toBe(true);
    await publish(versionId, 'after-logout').expect(401);
    await db.execute('UPDATE platform_forms SET archived = 1');
    await get('/releases/' + afterLogout.releaseId).expect(200);
    expect(await auditCount()).toBe(3);
  } finally {
    await app.close();
    vi.unstubAllEnvs();
  }
});
