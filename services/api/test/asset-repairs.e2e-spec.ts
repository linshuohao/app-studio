import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { diagnosticForms, formDefinition } from './fixtures/diagnostic-corpus.js';

it('groups asset tasks on the original release and records human review against a pinned PR revision', async () => {
  const origin = 'http://127.0.0.1:3200';
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  vi.stubEnv('PLATFORM_DIAGNOSTICS_STUDIO_PILOT', '1');
  vi.stubEnv('PLATFORM_ASSET_REPAIR_REPOSITORY', 'local-testing/form-assets');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    const client = request(app.getHttpServer());
    const db = module.get(PlatformDatabase).executor;
    const access = module.get(PlatformAccess);
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    const cookies: Record<string, string> = {};
    for (const [user, role] of [
      ['maintainer', 'admin'],
      ['reviewer', 'admin'],
      ['developer', 'editor'],
      ['reader', 'viewer'],
    ] as const) {
      await db.execute('INSERT INTO platform_users VALUES ($1,1)', [user]);
      await db.execute('INSERT INTO platform_members VALUES ($1,$1,$2,1)', [user, defaultSpaceId]);
      await db.execute('INSERT INTO platform_member_roles VALUES ($1,$2)', [user, role]);
      cookies[user] = 'platform-session=' + (await access.issueSession(user, 'test')).token;
    }
    const get = (path: string, user = 'maintainer') =>
      client.get('/api/platform/' + path).set('Cookie', cookies[user]!);
    const post = (path: string, body: object, user = 'maintainer', key = randomUUID()) =>
      client
        .post('/api/platform/' + path)
        .set('Cookie', cookies[user]!)
        .set('Origin', origin)
        .set('Idempotency-Key', key)
        .send(body);

    const definition = formDefinition(diagnosticForms[0]!);
    const form = (await post('forms', { name: '资产故障表单' }).expect(201)).body;
    const version = (
      await post('forms/' + form.formId + '/versions', {
        text: JSON.stringify(definition),
      }).expect(201)
    ).body;
    const { releaseId, success } = (
      await post('forms/' + form.formId + '/releases', {
        versionId: version.versionId,
        profile: 'main',
      }).expect(201)
    ).body;
    expect(success).toBe(true);
    const delivery = (await get('releases/' + releaseId).expect(200)).body;
    const prepared = JSON.parse(delivery.preparedText);
    const lock = prepared.capabilityLock.materials.section;
    const { owner } = (await get('diagnostics/pilot').expect(200)).body;
    const record = async () => {
      const { body } = await post('diagnostics/pilot/events', {
        schemaVersion: 1,
        eventId: randomUUID(),
        releaseId,
        source: 'renderer',
        phase: 'render',
        errorCode: 'MATERIAL_UNAVAILABLE',
        targetKind: 'material_node',
        targetId: prepared.definition.views.main.id,
        occurredAt: new Date().toISOString(),
        evidenceStatus: 'captured',
        evidence: { message: 'host-private-form-input', occurrence: 'instance-9' },
      })
        .set('X-Diagnostic-Owner', owner)
        .expect(201);
      return 'diagnostics/events/' + body.diagnosticId + '/asset-repairs';
    };
    const first = await record();
    const second = await record();
    expect((await get(first).expect(200)).body).toEqual([{ kind: 'material', lock }]);
    await post(first, { kind: 'material', assetId: 'text-input' }).expect(400);
    await post(first, { kind: 'material', assetId: 'section' }, 'developer').expect(403);
    const { id } = (await post(first, { kind: 'material', assetId: 'section' }).expect(201)).body;
    expect((await post(second, { kind: 'material', assetId: 'section' }).expect(201)).body).toEqual(
      { id },
    );
    expect((await post(second, { kind: 'material', assetId: 'section' }).expect(201)).body).toEqual(
      { id },
    );
    await get('asset-repairs', 'reader').expect(403);
    await get('asset-repairs/reviews', 'reader').expect(403);
    expect((await get('asset-repairs/reviews', 'developer').expect(200)).body).toEqual({
      repository: 'local-testing/form-assets',
      rows: [],
    });
    await get(first, 'developer').expect(403);
    expect((await get('asset-repairs', 'developer').expect(200)).body).toHaveLength(1);
    const task = 'asset-repairs/' + id;
    const original = (await get(task, 'developer').expect(200)).body;
    expect(original).toMatchObject({
      id,
      releaseId,
      versionId: version.versionId,
      asset: lock,
      status: 'open',
      revision: 0,
    });
    expect(original.occurrences).toHaveLength(2);
    expect(JSON.stringify(original)).not.toContain('host-private-form-input');

    const action = (body: object, user: string, key = randomUUID()) =>
      post(task + '/actions', body, user, key);
    const claim = { action: 'claim', revision: 0 };
    const claims = await Promise.all([action(claim, 'maintainer'), action(claim, 'developer')]);
    expect(claims.map(({ status }) => status).sort()).toEqual([200, 409]);
    const assignee = claims[0]?.status === 200 ? 'maintainer' : 'developer';
    const pr = {
      url: 'https://github.com/local-testing/form-assets/pull/42',
      headSha: 'a'.repeat(40),
      version: lock.version.replace(/\d+$/, (last: string) => String(Number(last) + 1)),
    };
    const submit = { action: 'submit', revision: 1, pullRequest: pr };
    await action(submit, 'reviewer').expect(403);
    await action(
      { ...submit, pullRequest: { ...pr, url: 'https://github.com/elsewhere/another/pull/42' } },
      assignee,
    ).expect(400);
    await action({ ...submit, pullRequest: { ...pr, version: lock.version } }, assignee).expect(
      400,
    );
    const requestKey = randomUUID();
    const submitted = (await action(submit, assignee, requestKey).expect(200)).body;
    expect(submitted).toEqual({ id, revision: 2, status: 'in_review' });
    vi.stubEnv('PLATFORM_ASSET_REPAIR_GITHUB_TOKEN', 'test-token');
    const github = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        Response.json({ data: { repository: { pr42: { state: 'MERGED', isDraft: false } } } }),
      );
    const reviews = (await get('asset-repairs/reviews', 'developer').expect(200)).body;
    expect(reviews.rows).toHaveLength(1);
    expect(reviews.rows[0]).toMatchObject({
      id,
      pullRequest: pr,
      status: 'in_review',
      githubStatus: 'merged',
    });
    expect(github).toHaveBeenCalledTimes(1);
    expect(github.mock.calls[0]?.[0]).toBe('https://api.github.com/graphql');
    vi.stubEnv('PLATFORM_ASSET_REPAIR_REPOSITORY', undefined);
    const historical = (await get('asset-repairs/reviews', 'developer').expect(200)).body;
    expect(historical.repository).toBeNull();
    expect(historical.rows).toHaveLength(1);
    expect(historical.rows[0]).toMatchObject({ id, pullRequest: pr, status: 'in_review' });
    expect(historical.rows[0]).not.toHaveProperty('githubStatus');
    expect(github).toHaveBeenCalledTimes(1);
    github.mockRestore();
    vi.stubEnv('PLATFORM_ASSET_REPAIR_GITHUB_TOKEN', undefined);
    expect((await get(task, 'developer').expect(200)).body.repository).toBeNull();
    vi.stubEnv('PLATFORM_ASSET_REPAIR_REPOSITORY', 'local-testing/form-assets');
    expect((await action(submit, assignee, requestKey).expect(200)).body).toEqual(submitted);
    await action(
      { ...submit, pullRequest: { ...pr, headSha: 'b'.repeat(40) } },
      assignee,
      requestKey,
    ).expect(409);
    await action({ action: 'approve', revision: 2 }, assignee).expect(403);
    await action({ action: 'request_changes', revision: 2 }, 'reviewer').expect(400);
    await action(
      { action: 'request_changes', revision: 2, note: '补充历史制品回归。' },
      'reviewer',
    ).expect(200);
    const updated = { ...pr, headSha: 'c'.repeat(40) };
    await action({ ...submit, revision: 3, pullRequest: updated }, assignee).expect(200);
    await action({ action: 'approve', revision: 2 }, 'reviewer').expect(409);
    const approved = (await action({ action: 'approve', revision: 4 }, 'reviewer').expect(200))
      .body;
    expect(approved).toEqual({ id, revision: 5, status: 'approved' });
    const detail = (await get(task, 'developer').expect(200)).body;
    expect(detail.pullRequest).toEqual(updated);
    expect(detail.actions).toHaveLength(5);
    expect(detail.actions[0].detail.pullRequest.headSha).toBe(updated.headSha);
    expect(detail.actions[2].detail.note).toBe('补充历史制品回归。');
    expect((await get('releases/' + releaseId).expect(200)).body.preparedText).toBe(
      delivery.preparedText,
    );
  } finally {
    await app.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  }
});
