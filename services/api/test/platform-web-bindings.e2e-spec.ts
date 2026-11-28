import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runner } from 'node-pg-migrate';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { legacyAssetBindingEvidence } from '../src/platform/asset-binding-evidence.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';

const text = JSON.stringify({
  protocolVersion: 'tests',
  id: 'asset-revisions',
  version: '1',
  data: { schema: { type: 'object', properties: { name: { type: 'string' } } } },
  views: {
    default: { material: 'text-input', bindings: { value: { source: 'data', path: '/name' } } },
  },
});

async function assetForm(enabled: boolean, sourceText = text) {
  const origin = 'http://127.0.0.1:3200';
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  vi.stubEnv('PLATFORM_WEB_ASSET_VERSION_SELECTION', enabled ? 'true' : undefined);
  const app = (
    await Test.createTestingModule({ imports: [AppModule] }).compile()
  ).createNestApplication();
  try {
    await app.init();
    const db = app.get(PlatformDatabase).executor;
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    await db.execute("INSERT INTO platform_users VALUES ('user', 1)");
    await db.execute("INSERT INTO platform_members VALUES ('member', 'user', $1, 1)", [
      defaultSpaceId,
    ]);
    await db.execute("INSERT INTO platform_member_roles VALUES ('member', 'admin')");
    const { token } = await app.get(PlatformAccess).issueSession('user', 'integration');
    const api = request(app.getHttpServer());
    const cookie = 'platform-session=' + token;
    const post = (path: string, key: string) =>
      api
        .post('/api/platform' + path)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .set('Idempotency-Key', key);
    const { formId } = (await post('/forms', 'create').send({ name: '资产修订' }).expect(201)).body;
    const path = '/forms/' + formId;
    const { versionId } = (
      await post(path + '/versions', 'first')
        .send({ text: sourceText })
        .expect(201)
    ).body;
    const revisions = async (version: string, formPath = path) =>
      (
        await api
          .get('/api/platform' + formPath + '/versions/' + version)
          .set('Cookie', cookie)
          .expect(200)
      ).body;
    return { app, db, post, revisions, path, versionId };
  } catch (error) {
    await app.close();
    throw error;
  }
}

it('renders and publishes existing configurations while revision asset selection is paused', async () => {
  const sourceText = JSON.stringify({
    ...JSON.parse(text),
    constraints: [
      {
        id: 'name-exists',
        kind: 'internal',
        assert: { op: 'core.exists', args: [{ ref: { source: 'data', path: '/name' } }] },
        issue: {
          target: { source: 'data', path: '/name' },
          code: 'NAME',
          message: { text: '填写姓名' },
        },
      },
    ],
  });
  const { app, db, post, revisions, path, versionId } = await assetForm(false, sourceText);
  try {
    expect((await revisions(versionId)).assetBindings).toBeNull();
    const preview = await post(path + '/preview', 'legacy-preview')
      .send({ versionId })
      .expect(200);
    expect(preview.body.success).toBe(true);
    const lock = preview.body.prepared.capabilityLock;
    expect(lock.pureFunctions['core.exists']).toBeDefined();
    // This revision was saved while selection was enabled against a build that is no longer installed.
    const unavailable = [
      {
        profile: 'default',
        selections: (['materials', 'pureFunctions'] as const).flatMap((kind) =>
          Object.keys(lock[kind]).map((id) => ({
            kind,
            id,
            lock: {
              ...lock[kind][id],
              artifact: { ...lock[kind][id].artifact, digest: 'sha256:' + 'f'.repeat(64) },
            },
          })),
        ),
      },
    ];
    await db.execute('UPDATE platform_versions SET web_asset_bindings=$2 WHERE version_id=$1', [
      versionId,
      JSON.stringify(unavailable),
    ]);
    const edited = await post(path + '/preview', 'working-preview')
      .send({ text: sourceText, basedOnVersionId: versionId })
      .expect(200);
    expect(edited.body.prepared.capabilityLock).toEqual(lock);
    await post(path + '/versions', 'paused-choice')
      .send({
        text: sourceText,
        basedOnVersionId: versionId,
        assetChoices: [
          {
            profile: 'default',
            kind: 'materials',
            id: 'text-input',
            version: lock.materials['text-input'].version,
            artifactDigest: lock.materials['text-input'].artifact.digest,
          },
        ],
      })
      .expect(409);
    expect(
      (
        await post(path + '/check', 'check')
          .send({ versionId })
          .expect(200)
      ).body.success,
    ).toBe(true);
    const published = await post(path + '/releases', 'publish')
      .send({ versionId })
      .expect(201);
    expect(published.body.success).toBe(true);
    expect((await revisions(versionId)).assetBindings).toEqual(unavailable);
  } finally {
    await app.close();
  }
});

it('keeps asset choices with immutable revisions and requires explicit binding for unobserved legacy references', async () => {
  const { app, db, post, revisions, path, versionId } = await assetForm(true);
  try {
    const [selection] = (await revisions(versionId)).assetBindings[0].selections;
    expect(selection).toMatchObject({ kind: 'materials', id: 'text-input' });
    expect(selection.lock.artifact.digest).toMatch(/^sha256:/);
    // Simulate a version written before the additive migration.
    await db.execute('UPDATE platform_versions SET web_asset_bindings=NULL WHERE version_id=$1', [
      versionId,
    ]);
    const pending = (
      await post(path + '/check', 'check')
        .send({ versionId })
        .expect(200)
    ).body;
    expect(pending).toMatchObject({
      success: false,
      diagnostics: [{ code: 'ASSET_BINDING_PENDING', sourcePointer: '/views/default/material' }],
    });
    expect(
      (
        await post(path + '/releases', 'pending')
          .send({ versionId })
          .expect(201)
      ).body.success,
    ).toBe(false);
    const choice = {
      profile: 'default',
      kind: selection.kind,
      id: selection.id,
      version: selection.lock.version,
      artifactDigest: selection.lock.artifact.digest,
    };
    const staged = { text, basedOnVersionId: versionId, assetChoices: [choice] };
    expect(
      (
        await post(path + '/preview', 'preview')
          .send(staged)
          .expect(200)
      ).body.prepared.capabilityLock.materials['text-input'],
    ).toEqual(selection.lock);
    const bound = (
      await post(path + '/versions', 'bind')
        .send(staged)
        .expect(201)
    ).body.versionId;
    expect((await revisions(bound)).assetBindings[0].selections).toEqual([selection]);
    expect((await revisions(versionId)).assetBindings).toBeNull();
    await post(path + '/versions', 'bind')
      .send({ text, basedOnVersionId: versionId })
      .expect(409);
    const malformed = JSON.stringify({ ...JSON.parse(text), version: undefined });
    const invalidVersion = (
      await post(path + '/versions', 'existing-invalid')
        .send({ text: malformed })
        .expect(201)
    ).body.versionId;
    await db.execute('UPDATE platform_versions SET web_asset_bindings=NULL WHERE version_id=$1', [
      invalidVersion,
    ]);
    const repaired = (
      await post(path + '/check', 'repair-without-binding')
        .send({ text, basedOnVersionId: invalidVersion })
        .expect(200)
    ).body;
    expect(repaired.diagnostics).toContainEqual(
      expect.objectContaining({ code: 'ASSET_BINDING_PENDING' }),
    );
    await post(path + '/versions', 'stale-catalog')
      .send({ text, inspectedCatalog: 'superseded' })
      .expect(409);
    const published = (
      await post(path + '/releases', 'published')
        .send({ versionId: bound })
        .expect(201)
    ).body;
    expect(published.success).toBe(true);
    await db.execute('UPDATE platform_versions SET web_asset_bindings=NULL WHERE version_id=$1', [
      bound,
    ]);
    expect(
      (
        await post(path + '/preview', 'legacy-preview')
          .send({ versionId: bound })
          .expect(200)
      ).body.prepared.capabilityLock.materials['text-input'],
    ).toEqual(selection.lock);
    const copy = (
      await post(path + '/copies', 'copy')
        .send({ name: '复制表单', versionId: bound })
        .expect(201)
    ).body;
    const copied = await revisions(copy.versionId, `/forms/${copy.formId}`);
    expect(copied.assetBindings[0].selections).toEqual([selection]);
  } finally {
    await app.close();
  }
});

it.each([
  [3, '1780000000008-draft-editing'],
  [1, '1780000000010-asset-repair-tasks'],
] as const)(
  'upgrades from %i migrations back (%s) without rewriting imported publications',
  async (count, last) => {
    const options = {
      databaseUrl: process.env.PLATFORM_DATABASE_URL!,
      dir: fileURLToPath(new URL('../migrations/', import.meta.url)),
      migrationsTable: 'platform_schema_migrations',
      count,
      log: () => {},
    };
    // Recreate the requested pre-upgrade schema in this disposable test database.
    await runner({ ...options, direction: 'down' });
    const database = new PlatformDatabase();
    const db = database.executor;
    try {
      const migrations = await db.many<{ name: string }>(
        'SELECT name FROM platform_schema_migrations ORDER BY id',
      );
      expect(migrations).toHaveLength(12 - count);
      expect(migrations.at(-1)?.name).toBe(last);
      await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
      await db.execute("INSERT INTO platform_users VALUES ('legacy-user', 1)");
      await db.execute(
        "INSERT INTO platform_members VALUES ('legacy-member', 'legacy-user', $1, 1)",
        [defaultSpaceId],
      );
      await db.execute(
        `INSERT INTO platform_forms(form_id, space_id, name, created_by, created_at)
      VALUES ('legacy-form', $1, '迁移前表单', 'legacy-user', '2026-11-01')`,
        [defaultSpaceId],
      );
      await db.execute(
        `INSERT INTO platform_versions(version_id, form_id, text, saved_by, saved_at)
      VALUES ('legacy-revision', 'legacy-form', $1, 'legacy-user', '2026-11-01')`,
        [Buffer.from(text)],
      );
      await db.execute(
        `INSERT INTO platform_release_requests
      (request_id, space_id, user_id, member_id, request_key, fingerprint, form_id, version_id, build_input)
      VALUES ('legacy-request', $1, 'legacy-user', 'legacy-member', 'request', 'fp', 'legacy-form', 'legacy-revision', '{}')`,
        [defaultSpaceId],
      );
      const preparedText = '{"raw": true}';
      const digest = 'sha256:' + createHash('sha256').update(preparedText).digest('hex');
      await db.execute(
        `INSERT INTO platform_releases
      (release_id, request_id, form_id, version_id, target, prepared_text, digest, diagnostics)
      VALUES ('legacy-release', 'legacy-request', 'legacy-form', 'legacy-revision', $1, $2, $3, '[]')`,
        [JSON.stringify({ platform: 'web', profile: 'default' }), preparedText, digest],
      );
      await runner({ ...options, direction: 'up' });
      await database.onModuleInit();
      expect(
        await db.one('SELECT prepared_text, digest FROM platform_releases WHERE release_id=$1', [
          'legacy-release',
        ]),
      ).toEqual({ prepared_text: preparedText, digest });
      expect(
        await db.one('SELECT text, web_asset_bindings FROM platform_versions WHERE version_id=$1', [
          'legacy-revision',
        ]),
      ).toEqual({ text: Buffer.from(text), web_asset_bindings: null });
      expect(await legacyAssetBindingEvidence(db, 'legacy-form', 'legacy-revision')).toEqual({
        unobserved: 'pending',
        profiles: [],
      });
    } finally {
      await database.onModuleDestroy();
    }
  },
);
