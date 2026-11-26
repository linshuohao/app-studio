import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
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

it('keeps asset choices with immutable revisions and requires explicit binding for unobserved legacy references', async () => {
  const origin = 'http://127.0.0.1:3200';
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
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
        .send({ text })
        .expect(201)
    ).body;
    const revisions = async (version: string) =>
      (
        await api
          .get('/api/platform' + path + '/versions/' + version)
          .set('Cookie', cookie)
          .expect(200)
      ).body;
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
    const copied = (
      await api
        .get(`/api/platform/forms/${copy.formId}/versions/${copy.versionId}`)
        .set('Cookie', cookie)
        .expect(200)
    ).body;
    expect(copied.assetBindings[0].selections).toEqual([selection]);
  } finally {
    await app.close();
  }
});
