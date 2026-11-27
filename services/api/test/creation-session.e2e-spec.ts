import { createHash, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { checkEnvironment } from '../src/platform/create-form-agent.js';
import { pinAgentAssetEnvironment } from '../src/platform/agent-asset-environments.js';
import { ReleaseBuild } from '../src/platform/release-build.js';
import type { Delivery } from '../src/platform/form-drafts.js';
import { maxConfigTextBytes } from '../src/platform/forms.js';

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
const largeConfig = (id: string) => {
  const definition = JSON.parse(config(id));
  definition.data.schema.description = '字'.repeat(5600);
  return JSON.stringify(definition);
};
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
function mockHistory(id: string) {
  upstream.mockResolvedValueOnce(Response.json({ id, turns: [] }));
}

function mockTurn(id: string, delivery: Delivery) {
  const turns = Array.from({ length: delivery.sourceRevision }, (_, idx) => ({
    turnId: idx === delivery.sourceRevision - 1 ? delivery.turnId : randomUUID(),
    message: '原话',
    result: { kind: 'proposal', summary: '候选就绪' },
    draftId: delivery.draftId,
  }));
  if (delivery.sourceRevision > 1) mockHistory(id);
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
  mockHistory(id);
  upstream.mockResolvedValueOnce(Response.json(delivery));
  return setup(
    'post',
    '/agent-conversations/' + id + '/deliveries/' + delivery.turnId + '/receive',
  );
}
it('prepares the exact checked delivery for its JSX guide without creating or rewriting a draft', async () => {
  const id = randomUUID();
  const original = proposal(config('original-candidate'));
  const path = `/agent-conversations/${id}/deliveries/${original.turnId}/integration`;
  mockHistory(id);
  upstream.mockResolvedValueOnce(Response.json(original));
  const guide = await setup('get', path).expect(200);
  expect(guide.body.candidateDigest).toBe(original.digest);
  expect(guide.body.prepared.definition.id).toBe('original-candidate');
  await setup('get', '/form-drafts/' + original.draftId).expect(404);

  mockHistory(id);
  upstream.mockResolvedValueOnce(Response.json({ ...original, candidateText: config('other') }));
  await setup('get', path).expect(502);
  mockHistory(id);
  upstream.mockResolvedValueOnce(Response.json({ ...original, checkEnvironment: 'other' }));
  const regenerated = await setup('get', path).expect(200);
  expect(regenerated.body.regenerated).toBe(true);
  expect(regenerated.body.candidateDigest).toBe(original.digest);
  expect(regenerated.body.prepared.definition.id).toBe('original-candidate');
  await setup('get', '/form-drafts/' + original.draftId).expect(404);

  const invalid = proposal('{}', { checkEnvironment: 'other' });
  mockHistory(id);
  upstream.mockResolvedValueOnce(Response.json(invalid));
  const failure = await setup('get', path).expect(409);
  expect(failure.body.message).toContain('当前编译环境中未通过检查');
  mockHistory(id);
  upstream.mockResolvedValueOnce(Response.json({ ...original, draftIssues: [] }));
  await setup('get', path).expect(404);
});
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
  mockHistory(id);
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
  const mergedText = largeConfig('merged');
  const merge = await setup('patch', base)
    .send({
      revision: second.body.draft.revision,
      text: mergedText,
      appliedDigest: revised.digest,
      name: '旅行',
      versionName: '首版',
    })
    .expect(200);
  await fetchDelivery(id, revised).expect(201);
  expect((await setup('get', base)).body.text).toBe(mergedText);
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
  const inspected = await setup('post', base + '/editor/preview')
    .send({ text: mergedText })
    .expect(201);
  expect(inspected.body.prepared.capabilityLock).toEqual(preview.body.prepared.capabilityLock);
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
  ).toBe(mergedText);
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
      workingText: mergedText,
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
      workingText: mergedText,
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
  const large = largeConfig('size-check');
  const withinLimit = large + ' '.repeat(maxConfigTextBytes - Buffer.byteLength(large));
  const candidate = withinLimit + ' ';
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
    .send({ candidate_text: withinLimit, check_environment: environment })
    .expect(200);
  expect(accepted.body).toMatchObject({ candidate_digest: digest(withinLimit), success: true });
});

it('keeps partial draft issues through replay and only clears applied issues with the full checked candidate', async () => {
  const conversationId = randomUUID();
  const issue = { message: '缺少删除绑定', sourcePointer: '/views', requirementIds: ['R26'] };
  const partial = proposal(config('partial'), { checkId: undefined, draftIssues: [issue] });
  const first = (await mockTurn(conversationId, partial).expect(201)).body.draft;
  expect(first.text).toBe(partial.candidateText);
  expect(first.draftIssues).toEqual([issue]);
  expect(first.appliedDraftIssues).toEqual([issue]);
  const replay = (await fetchDelivery(conversationId, partial).expect(201)).body.draft;
  expect(replay.revision).toBe(first.revision);

  const base = '/form-drafts/' + first.id;
  const complete = proposal(config('complete'), {
    draftId: first.id,
    baseRevision: first.revision,
    sourceRevision: 2,
  });
  const latest = (await mockTurn(conversationId, complete).expect(201)).body.draft;
  expect(latest.draftIssues).toEqual([]);
  expect(latest.appliedDraftIssues).toEqual([issue]);

  const merged = (
    await setup('patch', base)
      .send({
        revision: latest.revision,
        text: config('merged'),
        appliedDigest: complete.digest,
        name: '表单',
        versionName: '初稿',
      })
      .expect(200)
  ).body;
  expect(merged.appliedDraftIssues).toEqual([issue]);
  const preview = (
    await setup('post', base + '/preview')
      .send({
        revision: merged.revision,
        digest: complete.digest,
      })
      .expect(201)
  ).body;
  await setup('post', base + '/save')
    .send({
      revision: merged.revision,
      digest: complete.digest,
      previewDigest: preview.digest,
    })
    .expect(409);

  const applied = (
    await setup('patch', base)
      .send({
        revision: merged.revision,
        text: complete.candidateText,
        appliedDigest: complete.digest,
        name: '表单',
        versionName: '初稿',
      })
      .expect(200)
  ).body;
  expect(applied.appliedDraftIssues).toEqual([]);
});

it('refreshes applied draft issues when a new candidate confirms the same working text', async () => {
  const conversationId = randomUUID();
  const fixed = { message: '缺少删除绑定', sourcePointer: '/views', requirementIds: ['R26'] };
  const remaining = { message: '缺少联动', sourcePointer: '/reactions', requirementIds: ['R30'] };
  const text = config('partial');
  const initial = proposal(text, { checkId: undefined, draftIssues: [fixed, remaining] });
  const first = (await mockTurn(conversationId, initial).expect(201)).body.draft;
  const updated = proposal(text, {
    draftId: first.id,
    baseRevision: first.revision,
    sourceRevision: 2,
    checkId: undefined,
    draftIssues: [remaining],
  });
  const latest = (await mockTurn(conversationId, updated).expect(201)).body.draft;
  expect(latest.draftIssues).toEqual([remaining]);
  expect(latest.appliedDraftIssues).toEqual([remaining]);
});

it('forwards the saved working text for the exact draft revision and rejects an unpersisted override', async () => {
  const id = randomUUID();
  const initial = proposal(config('partial'), {
    checkId: undefined,
    draftIssues: [{ message: '待补充规则', sourcePointer: '/reactions', requirementIds: ['R26'] }],
  });
  const draft = (await mockTurn(id, initial).expect(201)).body.draft;
  const text = config('manually-revised');
  const saved = (
    await setup('patch', '/form-drafts/' + draft.id)
      .send({
        revision: draft.revision,
        text,
        appliedDigest: initial.digest,
        name: '表单',
        versionName: '初稿',
      })
      .expect(200)
  ).body;
  const turnId = randomUUID();
  const request = {
    revision: 1,
    turnId,
    draftId: draft.id,
    draftRevision: saved.revision,
    message: '检查当前版本',
  };
  const before = upstream.mock.calls.length;
  await setup('post', '/agent-conversations/' + id + '/turns')
    .send({
      ...request,
      workingText: config('unsaved'),
    })
    .expect(409);
  expect(upstream.mock.calls).toHaveLength(before);
  mockHistory(id);
  upstream.mockResolvedValueOnce(
    Response.json({
      conversation: {
        id,
        revision: 2,
        turns: [
          { turnId: initial.turnId },
          { turnId, result: { kind: 'answer', message: '已检查' } },
        ],
      },
    }),
  );
  await setup('post', '/agent-conversations/' + id + '/turns')
    .send(request)
    .expect(201);
  expect(JSON.parse(upstream.mock.calls.at(-1)![1].body)).toMatchObject({
    draftId: draft.id,
    draftRevision: saved.revision,
    workingText: text,
  });
});

it('retains issues from a selectively applied partial candidate when a later candidate arrives', async () => {
  const conversation = randomUUID();
  const initial = proposal(config('clean'));
  const draft = (await mockTurn(conversation, initial).expect(201)).body.draft;
  const issue = { message: '待补充规则', sourcePointer: '/reactions', requirementIds: ['R26'] };
  const partial = proposal(config('partial'), {
    checkId: undefined,
    draftId: draft.id,
    baseRevision: draft.revision,
    sourceRevision: 2,
    draftIssues: [issue],
  });
  const delivered = (await mockTurn(conversation, partial).expect(201)).body.draft;
  const edit = (
    await setup('patch', '/form-drafts/' + draft.id)
      .send({
        revision: delivered.revision,
        appliedDigest: partial.digest,
        text: config('merged-partial'),
        name: '表单',
        versionName: '初稿',
      })
      .expect(200)
  ).body;
  const complete = proposal(config('checked'), {
    draftId: draft.id,
    baseRevision: edit.revision,
    sourceRevision: 3,
  });
  const latest = (await mockTurn(conversation, complete).expect(201)).body.draft;
  expect(latest.draftIssues).toEqual([]);
  expect(latest.appliedDraftIssues).toEqual([issue]);
});

it('accepts only one concurrent candidate against the same draft revision', async () => {
  const conversation = randomUUID();
  const initial = proposal(config('shared'));
  const first = (await mockTurn(conversation, initial).expect(201)).body.draft;
  const candidates = ['candidate-a', 'candidate-b'].map((id) =>
    proposal(config(id), { draftId: first.id, baseRevision: first.revision, sourceRevision: 2 }),
  );
  upstream.mockImplementation(async (url: URL) => {
    if (url.pathname.endsWith('/' + conversation))
      return Response.json({ id: conversation, turns: [] });
    return Response.json(candidates.find((candidate) => url.pathname.endsWith(candidate.turnId)));
  });
  const replies = await Promise.all(
    candidates.map((candidate) =>
      setup(
        'post',
        '/agent-conversations/' + conversation + '/deliveries/' + candidate.turnId + '/receive',
      ),
    ),
  );
  expect(replies.map((reply) => reply.status).sort()).toEqual([201, 409]);
  const current = (await setup('get', '/form-drafts/' + first.id).expect(200)).body;
  expect(current.revision).toBe(first.revision + 1);
  expect(current.text).toBe(initial.candidateText);
  expect(current.candidateText).toBe(
    replies.find((reply) => reply.status === 201)!.body.draft.candidateText,
  );
});

it('serializes two saves of the same working version while allowing a separate working version', async () => {
  const versions = (
    await setup('post', '/forms')
      .set('Idempotency-Key', randomUUID())
      .send({ name: '协作表单' })
      .expect(201)
  ).body;
  const form = '/forms/' + versions.formId;
  const createWork = (name: string) =>
    setup('post', form + '/work')
      .set('Idempotency-Key', randomUUID())
      .send({ name, text: config('base') })
      .expect(201);
  const [working, separate] = await Promise.all([
    createWork('同一工作版本'),
    createWork('独立工作版本'),
  ]);
  const save = (workId: string, text: string, basedOnVersionId?: string) =>
    setup('post', form + '/versions')
      .set('Idempotency-Key', randomUUID())
      .send({ workId, text, basedOnVersionId });
  const original = await save(working.body.id, config('initial')).expect(201);
  const base = original.body.versionId;
  const results = await Promise.all([
    save(working.body.id, config('person-a'), base),
    save(working.body.id, config('agent-b'), base),
    save(separate.body.id, config('separate')),
  ]);
  expect(
    results
      .slice(0, 2)
      .map((response) => response.status)
      .sort(),
  ).toEqual([201, 409]);
  expect(results[2].status).toBe(201);
});

it('holds one draft editing slot and rejects competing changes before Agent generation', async () => {
  const id = randomUUID();
  const initial = proposal(config('exclusive'));
  const draft = (await mockTurn(id, initial).expect(201)).body.draft;
  const editing = '/form-drafts/' + draft.id + '/editing';
  const human = randomUUID();
  const grantId = randomUUID();
  const attempt = () =>
    setup('post', '/agent-conversations/' + randomUUID() + '/turns').send({
      turnId: randomUUID(),
      revision: 0,
      message: '更改字段',
      draftId: draft.id,
      draftRevision: draft.revision,
    });
  await setup('post', editing)
    .send({ editorId: human, grantId, revision: draft.revision })
    .expect(201);
  const previousCalls = upstream.mock.calls.length;
  await attempt().expect(409);
  expect(upstream.mock.calls).toHaveLength(previousCalls);
  const blockedStream = await attempt().set('Accept', 'text/event-stream').expect(200);
  expect(blockedStream.text).toContain('DRAFT_EDITING');
  expect(blockedStream.text).toContain('草稿正在由人工编辑，本次修改未开始。');
  expect(upstream.mock.calls).toHaveLength(previousCalls);
  const questionId = randomUUID();
  const questionTurn = randomUUID();
  upstream.mockResolvedValueOnce(
    Response.json({
      conversation: {
        id: questionId,
        revision: 1,
        turns: [
          {
            turnId: questionTurn,
            result: { kind: 'answer', message: '当前有一个视图。' },
          },
        ],
      },
    }),
  );
  await setup('post', '/agent-conversations/' + questionId + '/turns')
    .send({
      turnId: questionTurn,
      revision: 0,
      message: '当前有几个视图？',
      readOnly: true,
      draftId: draft.id,
      draftRevision: draft.revision,
    })
    .expect(201);
  expect(JSON.parse(upstream.mock.calls.at(-1)![1].body)).toMatchObject({ readOnly: true });
  const noticed = (await setup('get', editing + '?editorId=' + human).expect(200)).body;
  expect(noticed).toMatchObject({ holder: 'human', own: true, blocked: 'agent' });
  await setup('post', editing + '/release')
    .send({ token: randomUUID() })
    .expect(204);
  await attempt().expect(409);
  await setup('post', editing + '/release')
    .send({ token: grantId })
    .expect(204);

  let started!: () => void;
  let finish!: (value: Response) => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  mockHistory(id);
  upstream.mockImplementationOnce(() => {
    started();
    return new Promise<Response>((resolve) => {
      finish = resolve;
    });
  });
  const nextTurnId = randomUUID();
  const result = setup('post', '/agent-conversations/' + id + '/turns')
    .send({
      turnId: nextTurnId,
      revision: 1,
      message: '更改字段',
      draftId: draft.id,
      draftRevision: draft.revision,
    })
    .then((response) => response);
  await running;
  try {
    await setup('post', editing)
      .send({ editorId: human, grantId, revision: draft.revision })
      .expect(409);
    const forAgent = (await setup('get', editing + '?conversationId=' + id).expect(200)).body;
    expect(forAgent).toMatchObject({ holder: 'agent', own: true, blocked: 'human' });
    await attempt().expect(409);
  } finally {
    finish(
      Response.json({
        conversation: {
          id,
          revision: 2,
          turns: [
            { turnId: initial.turnId },
            {
              turnId: nextTurnId,
              result: { kind: 'answer', message: '完成检查' },
            },
          ],
        },
      }),
    );
  }
  expect((await result).status).toBe(201);
  expect((await setup('get', editing).expect(200)).body.holder).toBeNull();
});

it('expires a human grant without letting it save or release the next grant', async () => {
  const draft = (await mockTurn(randomUUID(), proposal(config('lease'))).expect(201)).body.draft;
  const base = '/form-drafts/' + draft.id;
  const editorId = randomUUID(),
    previous = randomUUID(),
    next = randomUUID();
  const acquire = (grantId: string) =>
    setup('post', base + '/editing').send({ editorId, grantId, revision: draft.revision });
  await acquire(previous).expect(201);
  await app
    .get(PlatformDatabase)
    .executor.execute(
      "UPDATE platform_draft_editing SET expires_at=now()-interval '1 second' WHERE draft_id=$1",
      [draft.id],
    );
  await acquire(next).expect(201);
  await setup('post', base + '/editing/release')
    .send({ token: previous })
    .expect(204);
  const edit = {
    revision: draft.revision,
    text: config('edited'),
    appliedDigest: draft.appliedDigest,
    name: '互斥验证',
    versionName: '初稿',
  };
  await setup('patch', base)
    .send({ ...edit, editingToken: previous })
    .expect(409);
  await setup('patch', base)
    .send({ ...edit, editingToken: next })
    .expect(200);
});

it('preserves the checked asset environment on resume and when preparing a candidate guide', async () => {
  const id = randomUUID();
  const db = app.get(PlatformDatabase).executor;
  const builds = app.get(ReleaseBuild);
  // With no bound section the candidate must fail compilation, even though the default catalog has it.
  const bindings = [
    { profile: 'default', selections: [{ kind: 'materials' as const, id: 'section', lock: null }] },
  ];
  const pinned = await pinAgentAssetEnvironment(db, builds, bindings);
  const original = proposal(config('pinned-candidate'), { checkEnvironment: pinned });
  mockHistory(id);
  upstream.mockResolvedValueOnce(Response.json(original));
  await setup('get', `/agent-conversations/${id}/deliveries/${original.turnId}/integration`).expect(
    409,
  );

  // Simulate a previous compiler's environment for the same asset choices.
  const historical = '1'.repeat(64);
  await db.execute(
    'INSERT INTO platform_agent_asset_environments(id, baseline, web_asset_bindings) VALUES ($1,$2,$3)',
    [historical, 'previous-compiler', JSON.stringify(bindings)],
  );
  upstream.mockResolvedValueOnce(
    Response.json({
      id,
      attempts: [{ turnId: original.turnId, status: 'interrupted', checkEnvironment: historical }],
    }),
  );
  upstream.mockResolvedValueOnce(
    Response.json({
      conversation: {
        id,
        turns: [{ turnId: original.turnId, result: { kind: 'answer', message: '恢复' } }],
      },
    }),
  );
  await setup('post', `/agent-conversations/${id}/turns/${original.turnId}/resume`)
    .send({})
    .expect(201);
  expect(upstream.mock.calls.at(-2)![0].searchParams.get('includeCheckEnvironment')).toBe('true');
  expect(JSON.parse(upstream.mock.calls.at(-1)![1].body)).toEqual({ check_environment: pinned });
});

it('supplies the installed compiler environment when resuming a saved Agent turn', async () => {
  const id = randomUUID();
  const turnId = randomUUID();
  upstream.mockResolvedValueOnce(
    Response.json({ id, attempts: [{ turnId, status: 'interrupted' }] }),
  );
  upstream.mockResolvedValueOnce(
    Response.json({
      conversation: {
        id,
        turns: [{ turnId, message: '原始需求', result: { kind: 'answer', message: '继续完成' } }],
      },
    }),
  );
  const path = '/agent-conversations/' + id + '/turns/' + turnId + '/resume';
  await setup('post', path).send({ check_environment: 'client-supplied' }).expect(201);
  const [url, request] = upstream.mock.calls[1]!;
  expect(url.pathname).toBe('/internal/v1/conversations/' + id + '/turns/' + turnId + '/resume');
  expect(JSON.parse(request.body)).toEqual({
    check_environment: checkEnvironment(app.get(ReleaseBuild)),
  });
});

it('relays scoped progress and reply chunks before the turn result', async () => {
  const id = randomUUID();
  const turnId = randomUUID();
  upstream.mockImplementationOnce((_url, request) => {
    const traceId = request.headers['X-Trace-Id'];
    const turn = { turnId, result: { kind: 'answer', message: '编译通过' } };
    const frames = [
      { type: 'progress', stage: 'schema', message: '正在生成数据 Schema' },
      { type: 'text_delta', delta: '编译通过' },
      { type: 'result', result: { conversation: { id, turns: [turn] } } },
    ];
    return new Response(
      frames.map((frame) => JSON.stringify({ traceId, ...frame }) + '\n').join(''),
      {
        headers: { 'Content-Type': 'application/x-ndjson' },
      },
    );
  });
  const response = await setup('post', '/agent-conversations/' + id + '/turns')
    .set('Accept', 'text/event-stream')
    .send({ turnId, revision: 0, message: '检查表单' })
    .buffer(true)
    .expect(200);
  const frames = response.text
    .split('\n')
    .filter((line) => line.startsWith('data: {'))
    .map((line) => JSON.parse(line.slice(6)));
  const progressIndex = frames.findIndex(({ type }) => type === 'data-stage-progress');
  const textIndex = frames.findIndex(({ type }) => type === 'text-delta');
  const resultIndex = frames.findIndex(({ type }) => type === 'data-result');
  expect(frames[progressIndex]?.data).toEqual({ stage: 'schema', message: '正在生成数据 Schema' });
  expect(textIndex).toBeGreaterThan(progressIndex);
  expect(resultIndex).toBeGreaterThan(textIndex);
});

it('resolves an error ID into read-only Agent metadata and never forwards original values', async () => {
  vi.stubEnv('PLATFORM_DIAGNOSTICS_STUDIO_PILOT', '1');
  const { formId } = (
    await setup('post', '/forms')
      .set('Idempotency-Key', randomUUID())
      .send({ name: '错误引用试点' })
      .expect(201)
  ).body;
  const { versionId } = (
    await setup('post', `/forms/${formId}/versions`)
      .set('Idempotency-Key', randomUUID())
      .send({ text: config('diagnostic-reference') })
      .expect(201)
  ).body;
  const { releaseId } = (
    await setup('post', `/forms/${formId}/releases`)
      .set('Idempotency-Key', randomUUID())
      .send({ versionId })
      .expect(201)
  ).body;
  const { owner } = (await setup('get', '/diagnostics/pilot').expect(200)).body;
  const original = 'original-business-value-must-not-be-forwarded';
  const { diagnosticId } = (
    await setup('post', '/diagnostics/pilot/events')
      .set('X-Diagnostic-Owner', owner)
      .send({
        eventId: randomUUID(),
        schemaVersion: 1,
        releaseId,
        occurredAt: new Date().toISOString(),
        source: 'runtime',
        phase: 'flush',
        errorCode: 'flush.aborted',
        evidenceStatus: 'captured',
        evidence: { snapshot: { value: original } },
      })
      .expect(201)
  ).body;
  const reference = { kind: 'diagnostic', diagnosticId };
  const id = randomUUID(),
    turnId = randomUUID();
  const turn = {
    turnId,
    message: '定位错误',
    result: { kind: 'answer', message: '已定位到发布' },
  };
  const conversation = {
    id,
    title: '错误调查',
    revision: 1,
    updatedAt: '2026-11-25',
    turns: [turn],
  };
  const metadata = (await setup('get', `/diagnostics/events/${diagnosticId}/reference`).expect(200))
    .body;
  expect(metadata).toMatchObject({
    ...reference,
    formId,
    releaseId,
    versionId,
    evidenceStatus: 'captured',
  });
  expect(metadata).not.toHaveProperty('evidence');

  upstream.mockResolvedValueOnce(Response.json({ conversation }));
  await setup('post', `/agent-conversations/${id}/turns`)
    .send({
      turnId,
      revision: 0,
      message: turn.message,
      references: [{ ...reference, evidence: original }],
    })
    .expect(201);
  const body = upstream.mock.calls[0]![1].body as string;
  expect(body).not.toContain(original);
  expect(JSON.parse(body)).toMatchObject({ readOnly: true, references: [metadata] });

  await setup('post', `/agent-conversations/${id}/turns`)
    .send({
      turnId,
      revision: 0,
      message: turn.message,
      references: [{ ...reference, diagnosticId: randomUUID() }],
    })
    .expect(404);
  expect(upstream).toHaveBeenCalledTimes(1);
});
