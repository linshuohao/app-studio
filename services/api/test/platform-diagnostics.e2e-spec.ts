import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';

it('deduplicates delivery, groups actual occurrences, and restricts raw evidence', async () => {
  const origin = 'http://127.0.0.1:3200';
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  vi.stubEnv('PLATFORM_DIAGNOSTICS_STUDIO_PILOT', '1');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication<NestExpressApplication>();
  app.useBodyParser('json', { limit: '1mb' });
  try {
    await app.init();
    const db = module.get(PlatformDatabase).executor;
    const access = module.get(PlatformAccess);
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    const outsideSpace = 'other-space';
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [outsideSpace]);
    const cookies = new Map<string, string>();
    for (const [user, role] of [
      ['admin', 'admin'],
      ['viewer', 'viewer'],
      ['other', 'admin'],
      ['outsider', 'admin'],
    ]) {
      const space = user === 'outsider' ? outsideSpace : defaultSpaceId;
      await db.execute('INSERT INTO platform_users VALUES ($1,1)', [user]);
      await db.execute('INSERT INTO platform_members VALUES ($1,$1,$2,1)', [user, space]);
      await db.execute('INSERT INTO platform_member_roles VALUES ($1,$2)', [user, role]);
      cookies.set(user!, 'platform-session=' + (await access.issueSession(user!, 'test')).token);
    }
    const form = randomUUID();
    const version = randomUUID();
    const release = randomUUID();
    const prepared = JSON.stringify({ definition: { reactions: [{ id: 'clear-city' }] } });
    await db.execute(
      `
      INSERT INTO platform_forms (form_id,space_id,name,created_by,created_at)
      VALUES ($1,$2,'联动试填','admin','2026-11-25')
    `,
      [form, defaultSpaceId],
    );
    await db.execute(
      `
      INSERT INTO platform_versions (version_id,form_id,text,saved_by,saved_at)
      VALUES ($1,$2,$3,'admin','2026-11-25')
    `,
      [version, form, Buffer.from('{}')],
    );
    await db.execute(
      `
      INSERT INTO platform_release_requests
      (request_id, space_id, user_id, member_id, request_key, fingerprint,form_id,version_id,build_input)
      VALUES ('request',$1,'admin','admin','request','fingerprint',$2,$3,'{}')
    `,
      [defaultSpaceId, form, version],
    );
    await db.execute(
      `
      INSERT INTO platform_releases
      (release_id,request_id,form_id,version_id,target,prepared_text,digest,diagnostics)
      VALUES ($1,'request',$2,$3,'{}',$4,'digest','[]')
    `,
      [release, form, version, prepared],
    );

    const http = request(app.getHttpServer());
    const root = '/api/platform/diagnostics';
    const get = (path: string, user = 'admin') =>
      http.get(root + path).set('Cookie', cookies.get(user) ?? '');
    const { owner } = (await get('/pilot').expect(200)).body;
    const raw = { trigger: { country: 'JP', city: '東京' }, input: { country: 'JP', city: null } };
    const event = {
      schemaVersion: 1,
      eventId: randomUUID(),
      releaseId: release,
      occurredAt: new Date().toISOString(),
      source: 'runtime',
      phase: 'action',
      errorCode: 'reaction.action.error',
      targetKind: 'reaction',
      targetId: 'clear-city',
      evidenceStatus: 'captured',
      evidence: raw,
    };
    const post = (body: object, user = 'admin') =>
      http
        .post(root + '/pilot/events')
        .set('Cookie', cookies.get(user) ?? '')
        .set('Origin', origin)
        .set('X-Diagnostic-Owner', owner)
        .send(body);
    await post(event, 'other').expect(403);
    await post({ ...event, targetKind: undefined }).expect(400);
    await post({ ...event, targetId: undefined }).expect(400);
    await post({ ...event, targetKind: 'constraint' }).expect(400);
    await post({ ...event, targetId: 'unrelated' }).expect(400);
    await post({ ...event, evidence: { oversized: 'x'.repeat(512 * 1024) } }).expect(400);
    const [firstResponse, retry] = await Promise.all([
      post(event).expect(201),
      post(event).expect(201),
    ]);
    const first = firstResponse.body;
    expect(retry.body).toEqual(first);
    await post({ ...event, evidence: { different: true } }).expect(409);
    const second = (await post({ ...event, eventId: randomUUID() }).expect(201)).body;
    expect(second.diagnosticId).not.toBe(first.diagnosticId);

    const { body: groups } = await get('/groups').expect(200);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ count: 2, releaseId: release, targetId: 'clear-city' });
    expect(groups[0]).not.toHaveProperty('evidence');
    const group = '/groups/' + release + '/' + groups[0].fingerprint;
    await get('/groups', 'viewer').expect(403);
    await get(group, 'viewer').expect(403);
    const rows = (await get(group).expect(200)).body;
    expect(rows).toHaveLength(2);
    expect(rows[0]).not.toHaveProperty('evidence');
    await get('/events/' + first.diagnosticId, 'viewer').expect(403);
    await get('/groups', 'outsider').expect(403);
    await get(group, 'outsider').expect(403);
    await get('/events/' + first.diagnosticId, 'outsider').expect(403);
    const detail = (await get('/events/' + first.diagnosticId).expect(200)).body;
    expect(detail).toMatchObject({ versionId: version, evidence: raw });
    expect(await db.one('SELECT user_id FROM platform_diagnostic_reads')).toEqual({
      user_id: 'admin',
    });
    await db.execute(
      "UPDATE platform_diagnostic_events SET received_at=now()-interval '8 days' WHERE id=$1",
      [first.diagnosticId],
    );
    expect((await get('/events/' + first.diagnosticId).expect(200)).body).toMatchObject({
      evidenceStatus: 'expired',
      evidence: null,
    });

    vi.stubEnv('PLATFORM_DIAGNOSTICS_HOST_ID', 'external-host');
    vi.stubEnv('PLATFORM_DIAGNOSTICS_HOST_TOKEN', 'diagnostics-test-token');
    vi.stubEnv('PLATFORM_DIAGNOSTICS_HOST_FORM_ID', randomUUID());
    const report = { ...event, evidenceStatus: 'too_large', evidence: undefined };
    const postHost = (token: string) =>
      http
        .post(root + '/events')
        .set('Authorization', 'Bearer ' + token)
        .send(report);
    await postHost('different-test-token').expect(401);
    await postHost('diagnostics-test-token').expect(404);
    vi.stubEnv('PLATFORM_DIAGNOSTICS_HOST_FORM_ID', form);
    const accepted = (await postHost('diagnostics-test-token').expect(201)).body;
    const metadataOnly = (await get('/events/' + accepted.diagnosticId).expect(200)).body;
    expect(metadataOnly).toMatchObject({ evidenceStatus: 'too_large', evidence: null });

    const special = { value: 'before\u0000after', surrogate: '\ud83d' };
    const specialReceipt = (
      await post({ ...event, eventId: randomUUID(), evidence: special }).expect(201)
    ).body;
    const specialDetail = (await get('/events/' + specialReceipt.diagnosticId).expect(200)).body;
    expect(specialDetail.evidence).toEqual(special);

    await db.execute('UPDATE platform_release_requests SET space_id=$1 WHERE form_id=$2', [
      outsideSpace,
      form,
    ]);
    await db.execute('UPDATE platform_forms SET space_id=$1 WHERE form_id=$2', [
      outsideSpace,
      form,
    ]);
    expect((await get('/groups').expect(200)).body).toEqual([]);
    expect((await get(group).expect(200)).body).toEqual([]);
    await get('/events/' + first.diagnosticId).expect(404);
    await post({ ...event, eventId: randomUUID() }).expect(404);

    vi.stubEnv('CREATE_FORM_AGENT_URL', 'http://agent.invalid');
    vi.stubEnv('AGENT_SERVICE_TOKEN', 'test-service-token');
    const conversationId = randomUUID();
    const turnId = randomUUID();
    const turn = {
      turnId,
      references: [{ kind: 'diagnostic', diagnosticId: first.diagnosticId }],
    };
    const upstream = vi.fn(async (_url: URL, _options?: RequestInit) =>
      Response.json({
        id: conversationId,
        turns: [turn],
        attempts: [turn],
      }),
    );
    vi.stubGlobal('fetch', upstream);
    try {
      const path = '/api/platform/agent-conversations/' + conversationId;
      await http.get(path).set('Cookie', cookies.get('admin')!).expect(200);
      const followUpId = randomUUID();
      const privateMessage = '诊断历史中的受限信息';
      const followUpConversation = {
        id: conversationId,
        turns: [turn, { turnId: followUpId, result: { kind: 'answer', message: privateMessage } }],
      };
      upstream.mockImplementationOnce(async () =>
        Response.json({ id: conversationId, turns: [turn] }),
      );
      let agentAccept: string | null = null;
      upstream.mockImplementationOnce(async (_url: URL, options?: RequestInit) => {
        const headers = new Headers(options?.headers);
        agentAccept = headers.get('Accept');
        await db.execute('UPDATE platform_member_roles SET role=$1 WHERE member_id=$2', [
          'editor',
          'admin',
        ]);
        if (agentAccept === 'application/x-ndjson') {
          const traceId = headers.get('X-Trace-Id');
          return new Response(
            [
              { type: 'text_delta', traceId, delta: privateMessage },
              { type: 'result', traceId, result: { conversation: followUpConversation } },
            ]
              .map((entry) => JSON.stringify(entry))
              .join('\n') + '\n',
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          );
        }
        return Response.json({ conversation: followUpConversation });
      });
      const blockedStream = await http
        .post(path + '/turns')
        .set('Cookie', cookies.get('admin')!)
        .set('Origin', origin)
        .set('Accept', 'text/event-stream')
        .send({ turnId: followUpId, revision: 1, message: '解释一下之前的结果' })
        .expect(200);
      expect(agentAccept).toBeNull();
      expect(blockedStream.text).not.toContain(privateMessage);
      expect(blockedStream.text).toContain('"type":"data-failure","data":403');
      await http.get(path).set('Cookie', cookies.get('admin')!).expect(403);
      await http
        .post(path + '/turns/' + turnId + '/resume')
        .set('Cookie', cookies.get('admin')!)
        .set('Origin', origin)
        .expect(403);
      await http
        .post(path + '/turns')
        .set('Cookie', cookies.get('admin')!)
        .set('Origin', origin)
        .send({ turnId: randomUUID(), revision: 1, message: '继续分析' })
        .expect(403);
      const delivery = path + '/deliveries/' + followUpId;
      await http.get(delivery).set('Cookie', cookies.get('admin')!).expect(403);
      await http
        .get(delivery + '/integration')
        .set('Cookie', cookies.get('admin')!)
        .expect(403);
      await http
        .post(delivery + '/receive')
        .set('Cookie', cookies.get('admin')!)
        .set('Origin', origin)
        .expect(403);
      expect(upstream).toHaveBeenCalledTimes(9);
    } finally {
      vi.unstubAllGlobals();
    }
  } finally {
    await app.close();
    vi.unstubAllEnvs();
  }
});
