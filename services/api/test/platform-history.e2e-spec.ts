import { DatabaseSync } from 'node:sqlite';
import migrations from '../tools/legacy-sqlite-migrations.json' with { type: 'json' };
import { importSqlite } from '../tools/import-sqlite.mjs';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { travelDefinition } from '../../../apps/playground/src/demos/travel/definition.js';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
const raw = ' {\r\n "旧配置": \r\n';
const sourceId = '00000000-0000-4000-8000-000000000001';
const sourceVersion = '00000000-0000-4000-8000-000000000002';
const origin = 'http://127.0.0.1:3200';
it('upgrades existing history and serializes copying, metadata, archive and save after SQLite to PostgreSQL import', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'platform-history-'));
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    const snapshot = join(directory, 'legacy.sqlite');
    const old = new DatabaseSync(snapshot);
    try {
      old.exec(migrations[0]!);
      old.exec(`PRAGMA user_version = 1;
        INSERT INTO platform_users VALUES ('user', 1);
      `);
      old.prepare('INSERT INTO platform_spaces VALUES (?)').run(defaultSpaceId);
      old
        .prepare("INSERT INTO platform_members VALUES ('member', 'user', ?, 1)")
        .run(defaultSpaceId);
      old.exec("INSERT INTO platform_member_roles VALUES ('member', 'admin')");
      old
        .prepare("INSERT INTO platform_forms VALUES (?, ?, '旧表单', 'user', '2026-01-01', 0)")
        .run(sourceId, defaultSpaceId);
      old
        .prepare("INSERT INTO platform_versions VALUES (1, ?, ?, ?, 'user', '2026-01-01', NULL)")
        .run(sourceVersion, sourceId, Buffer.from(raw));
    } finally {
      old.close();
    }
    await importSqlite(snapshot, process.env.PLATFORM_DATABASE_URL!);
    await app.init();
    const db = module.get(PlatformDatabase).executor;
    const { token } = await module.get(PlatformAccess).issueSession('user', 'integration');
    const api = request(app.getHttpServer());
    const cookie = `platform-session=${token}`;
    const get = (path: string) => api.get(`/api/platform${path}`).set('Cookie', cookie);
    const post = (path: string, key = 'unused') =>
      api
        .post(`/api/platform${path}`)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('Idempotency-Key', key);
    const base = `/forms/${sourceId}`;
    const history = () => get(`${base}/versions`).expect(200);
    const save = (key: string, text = raw) =>
      post(`${base}/versions`, key).send({ text, basedOnVersionId: sourceVersion });
    const copy = (key: string) =>
      post(`${base}/copies`, key).send({ name: '归档副本', versionId: sourceVersion });
    expect((await get(`${base}/versions/${sourceVersion}`).expect(200)).body.text).toBe(raw);
    expect((await get(base).expect(200)).body).toMatchObject({ revision: 0, description: '' });
    const firstSave = (await save('before-archive', '{ "second": true }\n').expect(201)).body;
    expect((await history()).body.map((row: { versionId: string }) => row.versionId)).toEqual([
      firstSave.versionId,
      sourceVersion,
    ]);
    expect((await history()).body[0]).not.toHaveProperty('text');
    const named = (
      await post(`${base}/versions`, 'named-version')
        .send({ text: raw, basedOnVersionId: sourceVersion, name: '  出行规则调整  ' })
        .expect(201)
    ).body;
    expect((await get(`${base}/versions/${named.versionId}`).expect(200)).body.name).toBe(
      '出行规则调整',
    );
    expect(
      (
        await post(`${base}/versions`, 'named-version')
          .send({ text: raw, basedOnVersionId: sourceVersion, name: '出行规则调整' })
          .expect(201)
      ).body,
    ).toEqual(named);
    await post(`${base}/versions`, 'named-version')
      .send({ text: raw, basedOnVersionId: sourceVersion, name: '另一名称' })
      .expect(409);
    await post(`${base}/versions`, 'invalid-name')
      .send({ text: raw, name: 'a'.repeat(81) })
      .expect(400);
    await post(`${base}/versions`, 'multiline-name')
      .send({ text: raw, name: '第一行\n第二行' })
      .expect(400);
    await post(`${base}/metadata`)
      .send({ name: '新标题', description: '说明', revision: 0 })
      .expect(201);
    await post(`${base}/metadata`).send({ name: '过期', description: '', revision: 0 }).expect(409);
    expect((await get(base).expect(200)).body).toMatchObject({
      name: '新标题',
      description: '说明',
      revision: 1,
    });
    await post(`${base}/archive`).expect(201);
    await save('too-late').expect(409);
    expect((await save('before-archive', '{ "second": true }\n').expect(201)).body).toEqual(
      firstSave,
    );
    await db.execute(
      `CREATE FUNCTION reject_copy_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_key = 'copy-fail' THEN RAISE EXCEPTION 'injected copy receipt failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_copy BEFORE INSERT ON platform_receipts FOR EACH ROW EXECUTE FUNCTION reject_copy_fn()`,
    );
    await copy('copy-fail').expect(500);
    expect((await get('/forms').expect(200)).body).toHaveLength(1);
    expect((await db.one('SELECT COUNT(*) AS n FROM platform_versions', []))?.n).toBe(3);
    await db.execute('DROP TRIGGER reject_copy ON platform_receipts');
    const [created, replay] = await Promise.all([
      copy('copy-1').expect(201),
      copy('copy-1').expect(201),
    ]);
    expect(created.body).toEqual(replay.body);
    const destination = `/forms/${created.body.formId}`;
    expect((await get(`${destination}/versions`).expect(200)).body).toHaveLength(1);
    expect(
      (await get(`${destination}/versions/${created.body.versionId}`).expect(200)).body,
    ).toMatchObject({ text: raw, basedOnVersionId: sourceVersion });
    await get(`${destination}/versions/${sourceVersion}`).expect(404);
    await post(`${destination}/versions`, 'cross-form-save')
      .send({ text: raw, basedOnVersionId: sourceVersion })
      .expect(400);
    await db.execute("UPDATE platform_member_roles SET role = 'viewer'");
    await history();
    await copy('no-edit').expect(403);
    await post(`${base}/restore`).expect(403);
    await post(`${base}/preview`).send({ text: raw }).expect(403);
    const failed = (await post(`${base}/preview`).send({ versionId: sourceVersion }).expect(200))
      .body;
    expect(failed).toMatchObject({
      success: false,
      diagnostics: [{ code: 'JSON_SYNTAX', location: { line: 3 } }],
    });
    expect(failed).not.toHaveProperty('prepared');
    await post(`${base}/check`).send({ versionId: sourceVersion }).expect(403);
    await db.execute("UPDATE platform_member_roles SET role = 'admin'");
    await post(`${base}/restore`).expect(201);
    const local = (
      await post(`${base}/copies`, 'local-copy')
        .send({
          name: '草稿副本',
          text: ' 本地\n',
          basedOnVersionId: sourceVersion,
        })
        .expect(201)
    ).body;
    expect(
      (await get(`/forms/${local.formId}/versions/${local.versionId}`).expect(200)).body,
    ).toMatchObject({ text: ' 本地\n', basedOnVersionId: sourceVersion });
    const text = JSON.stringify({
      ...travelDefinition,
      views: { desktop: travelDefinition.views.desktop },
    });
    const checked = (await post(`${base}/check`).send({ text, profile: 'desktop' }).expect(200))
      .body;
    expect(checked.success, JSON.stringify(checked.diagnostics)).toBe(true);
    expect(checked).toMatchObject({
      success: true,
      target: { platform: 'web', profile: 'desktop' },
    });
    expect(checked).not.toHaveProperty('prepared');
    const compiled = (await post(`${base}/preview`).send({ text, profile: 'desktop' }).expect(200))
      .body;
    expect(compiled.prepared.definition.id).toBe('family-travel');
    const invalid = (await post(`${base}/preview`).send({ text: '{\n "id": 42\n}' }).expect(200))
      .body;
    expect(invalid).toMatchObject({
      success: false,
      diagnostics: expect.arrayContaining([
        expect.objectContaining({
          code: 'DEFINITION_INVALID',
          sourcePointer: '/id',
          location: { offset: 9, length: 2, line: 2, column: 8 },
        }),
      ]),
    });
    expect(invalid).not.toHaveProperty('prepared');
    expect((await history()).body).toHaveLength(3);
    const [saved, archived] = await Promise.all([save('racing-save'), post(`${base}/archive`)]);
    expect(archived.status).toBe(201);
    expect([201, 409]).toContain(saved.status);
    expect((await history()).body).toHaveLength(saved.status === 201 ? 4 : 3);
    expect(
      (await db.many('SELECT action FROM platform_form_audit ORDER BY sequence', [])).map(
        (row) => row.action,
      ),
    ).toEqual(['archive', 'restore', 'archive']);
    await db.execute("INSERT INTO platform_spaces VALUES ('other')", []);
    await db.execute("UPDATE platform_forms SET space_id = 'other' WHERE form_id = $1", [sourceId]);
    await get(`${base}/versions`).expect(404);
    await get(`${base}/versions/${sourceVersion}`).expect(404);
    await copy('other-space').expect(404);
    await post(`${base}/preview`).send({ versionId: sourceVersion }).expect(404);
    await api.get(`/api/platform${destination}/versions`).expect(401);
  } finally {
    await app.close();
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  }
});
