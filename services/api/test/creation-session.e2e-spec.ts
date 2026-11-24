import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { checkEnvironment } from '../src/platform/create-form-agent.js';
import { ReleaseBuild } from '../src/platform/release-build.js';
import type { Delivery } from '../src/platform/form-drafts.js';

const origin = 'http://127.0.0.1:3200';
let app: INestApplication;
let http: ReturnType<typeof request>;
let cookie: string;
let upstream = vi.fn();
const config = (id: string) =>
  JSON.stringify({
    protocolVersion: '1.0',
    id,
    version: '1.0',
    data: { schema: { type: 'object' } },
    views: { default: { material: 'section' } },
  });
const digest = (text: string) => 'sha256:' + createHash('sha256').update(text).digest('hex');
const setup = (method: 'post' | 'get' | 'delete' | 'patch', path: string) =>
  http[method]('/api/platform' + path)
    .set('Cookie', cookie)
    .set('Origin', origin);
beforeEach(async () => {
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('HOST', '127.0.0.1');
  vi.stubEnv('PLATFORM_LOCAL_LOGIN', 'true');
  vi.stubEnv('CREATE_FORM_AGENT_URL', 'http://agent.invalid');
  vi.stubEnv('AGENT_SERVICE_TOKEN', 'private-service');
  const mod = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = mod.createNestApplication();
  await app.init();
  http = request(app.getHttpServer());
  const login = await http.post('/api/platform/local-login').set('Origin', origin).expect(200);
  cookie = login.headers['set-cookie']!;
  upstream = vi.fn();
  vi.stubGlobal('fetch', upstream);
});
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  await app?.close();
});
function proposal(candidateText: string, overrides: Partial<Delivery> = {}): Delivery {
  return {
    target: 'draft',
    id: randomUUID(),
    turnId: randomUUID(),
    draftId: randomUUID(),
    sourceRevision: 1,
    candidateText,
    digest: digest(candidateText),
    checkId: randomUUID(),
    checkEnvironment: checkEnvironment(app.get(ReleaseBuild)),
    ...overrides,
  };
}
function mockTurn(id: string, delivery: Delivery) {
  const turns = Array.from({ length: delivery.sourceRevision }, (_, idx) => ({
    turnId: idx === delivery.sourceRevision - 1 ? delivery.turnId : randomUUID(),
    message: '原话',
    result: { kind: 'proposal', summary: '候选就绪' },
    draftId: delivery.draftId,
  }));
  upstream.mockResolvedValueOnce(
    Response.json({
      conversation: { id, title: '会话', revision: turns.length, updatedAt: '2026-11-23', turns },
      delivery,
    }),
  );
  return setup('post', '/agent-conversations/' + id + '/turns').send({
    revision: turns.length - 1,
    message: '建立表单',
    turnId: delivery.turnId,
    ...(delivery.baseRevision && {
      draftRevision: delivery.baseRevision,
      draftId: delivery.draftId,
    }),
  });
}
function fetchDelivery(id: string, delivery: Delivery) {
  upstream.mockResolvedValueOnce(Response.json(delivery));
  return setup(
    'post',
    '/agent-conversations/' + id + '/deliveries/' + delivery.turnId + '/receive',
  );
}
it('proxies Agent conversations under authenticated identity and never creates a draft for chat', async () => {
  const id = randomUUID(),
    turnId = randomUUID();
  const conversation = {
    id,
    title: '问答',
    revision: 1,
    updatedAt: '2026-11-23',
    turns: [
      {
        turnId,
        message: '什么是联动？',
        result: { kind: 'answer', message: '字段可随其他值变化。' },
      },
    ],
  };
  upstream.mockResolvedValueOnce(Response.json({ conversation }));
  const reply = await setup('post', '/agent-conversations/' + id + '/turns')
    .send({
      turnId,
      revision: 0,
      message: '什么是联动？',
      userId: 'forged',
      context: { target: 'forged' },
      history: ['forged'],
    })
    .expect(201);
  expect(reply.body).toEqual({ conversation });
  const [url, request] = upstream.mock.calls[0]!;
  expect(url.pathname).toBe('/internal/v1/conversations/' + id + '/turns');
  expect(request.headers['X-Agent-User']).not.toBe('forged');
  expect(request.headers['X-Agent-Space']).toBeTruthy();
  expect(request.headers.cookie).toBeUndefined();
  const body = JSON.parse(request.body);
  expect(body.context.target).toBe('web');
  expect(body.history).toBeUndefined();
  expect((await setup('get', '/form-drafts')).body).toEqual([]);
  expect(
    await app
      .get(PlatformDatabase)
      .executor.one("SELECT to_regclass('platform_creation_sessions') AS legacy"),
  ).toEqual({ legacy: null });
  await setup('post', '/create-form').send({}).expect(404);
  await setup('get', '/scenarios').expect(404);
  await setup('post', '/scenarios').send({}).expect(404);
  await setup('post', '/template-preview').send({}).expect(404);
  await setup('get', '/creation-sessions').expect(404);
});
it('keeps delivered draft editable after deleting the conversation, preserves manual work, previews and saves', async () => {
  const id = randomUUID(),
    initial = proposal(config('initial'));
  const first = await mockTurn(id, initial).expect(201);
  const presentId = randomUUID();
  upstream.mockResolvedValueOnce(
    Response.json({
      conversation: {
        ...first.body.conversation,
        revision: 2,
        turns: [
          ...first.body.conversation.turns,
          {
            turnId: presentId,
            message: '再看一下',
            result: { kind: 'proposal', summary: '同一候选' },
            draftId: initial.draftId,
          },
        ],
      },
      delivery: initial,
    }),
  );
  const repeated = await setup('post', '/agent-conversations/' + id + '/turns')
    .send({ turnId: presentId, revision: 1, message: '再看一下' })
    .expect(201);
  expect(repeated.body.draft.revision).toBe(first.body.draft.revision);
  const draft = first.body.draft;
  const base = '/form-drafts/' + draft.id;
  expect(draft.text).toBe(initial.candidateText);
  expect(draft.appliedDigest).toBe(initial.digest);
  expect((await fetchDelivery(id, initial)).body.draft.revision).toBe(1);
  const editedText = config('manual');
  const edit = await setup('patch', base)
    .send({
      revision: 1,
      text: editedText,
      appliedDigest: initial.digest,
      name: '旅行',
      versionName: '首版',
    })
    .expect(200);
  const revised = proposal(config('revised'), {
    draftId: draft.id,
    candidateBaseText: editedText,
    baseRevision: edit.body.revision,
    sourceRevision: 2,
  });
  const second = await mockTurn(id, revised).expect(201);
  expect(second.body.draft.text).toBe(editedText);
  expect(second.body.draft.candidateText).toBe(revised.candidateText);
  const merge = await setup('patch', base)
    .send({
      revision: second.body.draft.revision,
      text: config('merged'),
      appliedDigest: revised.digest,
      name: '旅行',
      versionName: '首版',
    })
    .expect(200);
  await fetchDelivery(id, revised).expect(201);
  expect((await setup('get', base)).body.text).toBe(config('merged'));
  upstream.mockResolvedValueOnce(new Response(null, { status: 204 }));
  await setup('delete', '/agent-conversations/' + id).expect(204);
  expect((await setup('get', '/form-drafts')).body.map((x: { id: string }) => x.id)).toContain(
    draft.id,
  );
  const action = { revision: merge.body.revision, digest: revised.digest };
  await setup('post', base + '/save')
    .send(action)
    .expect(409);
  const preview = await setup('post', base + '/preview')
    .send(action)
    .expect(201);
  const saved = await setup('post', base + '/save')
    .send({ ...action, previewDigest: preview.body.digest })
    .expect(201);
  const replay = await setup('post', base + '/save')
    .send({ ...action, previewDigest: preview.body.digest })
    .expect(201);
  expect(saved.body).toEqual(replay.body);
  expect(
    (await setup('get', '/forms/' + saved.body.formId + '/versions/' + saved.body.versionId)).body
      .text,
  ).toBe(config('merged'));
  // A newly opened editor conversation can edit the saved form without
  // recreating its deleted conversation or introducing another form draft.
  // Discovery on another browser gets the same server-verified draft reference
  // that the conversation owner requires to include a creation chat.
  upstream.mockResolvedValueOnce(Response.json([]));
  await setup(
    'get',
    '/agent-conversations?formId=' +
      saved.body.formId +
      '&workId=' +
      saved.body.workId +
      '&linkedDraftId=forged',
  ).expect(200);
  expect(upstream.mock.calls.at(-1)![0].searchParams.get('linkedDraftId')).toBe(initial.draftId);
  const editorId = randomUUID(),
    editorDelivery = proposal(config('edit-saved'), {
      target: 'editor',
      formId: saved.body.formId,
      workId: saved.body.workId,
    });
  const editedTurn = {
    turnId: editorDelivery.turnId,
    message: '修改表单',
    result: { kind: 'proposal', summary: '编辑候选' },
  };
  upstream.mockResolvedValueOnce(
    Response.json({
      conversation: { id: editorId, revision: 1, turns: [editedTurn] },
      delivery: editorDelivery,
    }),
  );
  const editor = await setup('post', '/agent-conversations/' + editorId + '/turns')
    .send({
      revision: 0,
      message: '修改表单',
      turnId: editorDelivery.turnId,
      formId: saved.body.formId,
      workId: saved.body.workId,
      workingText: config('merged'),
    })
    .expect(201);
  expect(editor.body.editorProposal.id).toBe(editorDelivery.id);
  expect(editor.body.draft).toBeUndefined();
  expect(JSON.parse(upstream.mock.calls.at(-1)![1].body)).toMatchObject({
    draftId: initial.draftId,
    context: { formId: saved.body.formId, workId: saved.body.workId },
  });
  await setup('post', '/agent-conversations/' + editorId + '/turns')
    .send({
      revision: 1,
      message: '修改',
      turnId: randomUUID(),
      formId: saved.body.formId,
      workId: randomUUID(),
      workingText: config('merged'),
    })
    .expect(404);
  expect((await setup('get', '/form-drafts')).body).toEqual([]);
});
it('rejects stale revisions and invalid deliveries, deleting a draft cannot remove its conversation or resurrect the draft', async () => {
  const id = randomUUID(),
    first = proposal(config('origin'));
  await mockTurn(id, first).expect(201);
  const base = '/form-drafts/' + first.draftId;
  const stale = proposal(config('stale'), {
    draftId: first.draftId,
    sourceRevision: 2,
    baseRevision: 1,
  });
  await setup('patch', base)
    .send({
      revision: 1,
      text: config('manual'),
      appliedDigest: first.digest,
      name: '独立草稿',
      versionName: '首版',
    })
    .expect(200);
  await fetchDelivery(id, stale).expect(409);
  await fetchDelivery(id, { ...first, digest: 'sha256:invalid' }).expect(502);
  const another = proposal(config('newer'), {
    draftId: first.draftId,
    baseRevision: 2,
    sourceRevision: 1,
  });
  await fetchDelivery(randomUUID(), another).expect(201);
  expect((await setup('get', base)).body.candidateText).toBe(another.candidateText);
  const count = upstream.mock.calls.length;
  await setup('delete', base).expect(204);
  expect(upstream.mock.calls.length).toBe(count);
  expect((await fetchDelivery(id, first)).body.draft).toBeNull();
  expect((await fetchDelivery(id, stale)).body.draft).toBeNull();
  await setup('get', base).expect(404);
  upstream.mockResolvedValueOnce(Response.json({ id, title: '依然存在', turns: [] }));
  expect((await setup('get', '/agent-conversations/' + id)).body.id).toBe(id);
});

it('reports an oversized UTF-8 candidate as a failed check tied to the exact text', async () => {
  const check = () =>
    http.post('/internal/agent-tools/check').set('X-Agent-Service-Token', 'private-service');
  const small = config('size-check');
  const candidate = JSON.stringify({ ...JSON.parse(small), description: '字'.repeat(5600) });
  const environment = checkEnvironment(app.get(ReleaseBuild));

  const response = await check()
    .send({ candidate_text: candidate, check_environment: environment })
    .expect(200);
  expect(response.body).toMatchObject({
    check_environment: environment,
    candidate_digest: digest(candidate),
    success: false,
    diagnostics: [expect.objectContaining({ code: 'CONFIG_TEXT_TOO_LARGE', severity: 'error' })],
    host_requirements: {},
  });

  await check().send({ candidate_text: 42, check_environment: environment }).expect(400);
  await check().send({ candidate_text: candidate, check_environment: 'unknown-build' }).expect(503);
  const accepted = await check()
    .send({ candidate_text: small, check_environment: environment })
    .expect(200);
  expect(accepted.body).toMatchObject({ candidate_digest: digest(small), success: true });
});
