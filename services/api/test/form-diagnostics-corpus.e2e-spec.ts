import { createHash, randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { Test } from '@nestjs/testing';
import {
  createCoreFunctions,
  createTravelIsEligibleAge,
  createTravelPersonPremium,
} from '@form-engine/pure-functions';
import { createRuntime, type Diagnostic } from '@form-engine/runtime';
import type { CallExpression } from '@form-engine/protocol/definition';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import request from 'supertest';
import { expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformAccess } from '../src/platform/access.js';
import { ReleaseBuild } from '../src/platform/release-build.js';
import { WebAssetCatalog } from '../src/platform/web-asset-catalog.js';
import { defaultSpaceId } from '../src/platform/credentials.js';
import { PlatformDatabase } from '../src/platform/database.js';
import {
  diagnosticForms,
  diagnosticHost,
  formDefinition,
  matchesDiagnosticSample,
  ref,
} from './fixtures/diagnostic-corpus.js';

it('publishes ten forms and verifies fifty runtime errors with twenty distinct failure signatures', async () => {
  const origin = 'http://127.0.0.1:3200';
  vi.stubEnv('PLATFORM_STUDIO_ORIGIN', origin);
  vi.stubEnv('PLATFORM_DIAGNOSTICS_STUDIO_PILOT', '1');
  vi.stubEnv('AGENT_SERVICE_TOKEN', 'corpus-service');
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = module.createNestApplication();
  try {
    await app.init();
    const db = module.get(PlatformDatabase).executor;
    await db.execute('INSERT INTO platform_spaces VALUES ($1)', [defaultSpaceId]);
    await db.execute("INSERT INTO platform_users VALUES ('corpus-admin',1)");
    await db.execute("INSERT INTO platform_members VALUES ('corpus-admin','corpus-admin',$1,1)", [
      defaultSpaceId,
    ]);
    await db.execute("INSERT INTO platform_member_roles VALUES ('corpus-admin','admin')");
    const { token } = await module.get(PlatformAccess).issueSession('corpus-admin', 'test');
    const client = request(app.getHttpServer());
    const cookie = 'platform-session=' + token;
    const get = (path: string) => client.get('/api/platform/' + path).set('Cookie', cookie);
    const post = (path: string, body: object) =>
      client
        .post('/api/platform/' + path)
        .set('Cookie', cookie)
        .set('Origin', origin)
        .set('Idempotency-Key', randomUUID())
        .send(body);
    const { owner } = (await get('diagnostics/pilot').expect(200)).body;
    const replay = (diagnosticId: string, releaseId: string, spaceId = defaultSpaceId) =>
      client
        .post('/internal/agent-tools/replay-diagnostic')
        .set('X-Agent-Service-Token', 'corpus-service')
        .set('X-Agent-User', 'corpus-admin')
        .set('X-Agent-Space', spaceId)
        .send({ diagnosticId, releaseId });
    const fixtures = [];
    let reproduced = 0;
    const signatures = new Set<string>();
    const diagnosticIds = new Set<string>();
    for (const form of diagnosticForms) {
      const config = formDefinition(form);
      const created = await post('forms', { name: form.name + ' · 诊断样本' }).expect(201);
      const { formId } = created.body as { formId: string };
      const saved = await post('forms/' + formId + '/versions', {
        text: JSON.stringify(config),
      }).expect(201);
      const { versionId } = saved.body as { versionId: string };
      const published = await post('forms/' + formId + '/releases', { versionId, profile: 'main' });
      expect(published.status, JSON.stringify(published.body)).toBe(201);
      expect(published.body.success, form.key + ': ' + JSON.stringify(published.body)).toBe(true);
      const { releaseId } = published.body as { releaseId: string };
      const delivery = (await get('releases/' + releaseId).expect(200)).body;
      const prepared = JSON.parse(delivery.preparedText) as PreparedForm;
      const artifact = prepared.capabilityLock.pureFunctions['core.eq']?.artifact;
      if (!artifact) throw new Error('Compiled control function artifact missing');
      const functions = {
        ...createCoreFunctions(artifact),
        'travel.isEligibleAge': createTravelIsEligibleAge(artifact),
        'travel.personPremium': createTravelPersonPremium(artifact),
      };

      const errors = [];
      for (const [index, sample] of form.cases.entries()) {
        for (let occurrence = 1; occurrence <= (index === 0 ? 3 : 2); occurrence++) {
          const record = `${form.key}-${sample.id}-${occurrence}`;
          const diagnostics: Diagnostic[] = [];
          const runtime: ReturnType<typeof createRuntime> = createRuntime({
            prepared,
            functions,
            traceCapacity: 0,
            maxExecutions: 4,
            data: { scenario: sample.id, record: '', amount: 10, result: 0, ...sample.input },
            host: diagnosticHost(form, (value) => {
              runtime.dispatch({ op: 'set', target: ref('/result'), value });
            }),
            onDiagnostic: (report) => {
              if (report.kind === 'runtime') diagnostics.push(report.entry);
            },
          });
          try {
            runtime.dispatch({ op: 'set', target: ref('/record'), value: record });
            await runtime.flush();
            if (sample.kind === 'validator' || sample.kind === 'assert' || sample.kind === 'when')
              await runtime.validate();
            await setImmediate();
            const diagnostic = diagnostics.find((item) => matchesDiagnosticSample(item, sample));
            expect(
              diagnostic?.evidence,
              `${sample.id}: ${JSON.stringify(
                diagnostics.map(({ kind, evidence }) => [
                  kind,
                  evidence?.phase,
                  evidence?.error.message,
                ]),
              )}`,
            ).toBeDefined();
            if (!diagnostic?.evidence) throw new Error('No captured diagnostic');
            signatures.add([sample.code, sample.phase, sample.error].join('|'));
            const accepted = await client
              .post('/api/platform/diagnostics/pilot/events')
              .set('Cookie', cookie)
              .set('Origin', origin)
              .set('X-Diagnostic-Owner', owner)
              .send({
                schemaVersion: 1,
                eventId: randomUUID(),
                releaseId,
                occurredAt: new Date().toISOString(),
                source: 'runtime',
                phase: sample.phase,
                errorCode: diagnostic.kind,
                targetId: sample.kind === 'loop' ? undefined : diagnostic.ruleId,
                targetKind:
                  diagnostic.ruleId && sample.kind !== 'loop'
                    ? sample.code === 'validation.error' || sample.code === 'validator.error'
                      ? 'constraint'
                      : 'reaction'
                    : undefined,
                evidenceStatus: 'captured',
                evidence: diagnostic.evidence,
              });
            expect(accepted.status, sample.id + ': ' + JSON.stringify(accepted.body)).toBe(201);
            const { diagnosticId } = accepted.body as { diagnosticId: string };
            diagnosticIds.add(diagnosticId);
            const receipt = await replay(diagnosticId, releaseId).expect(200);
            const isReactionCondition = sample.code === 'reaction.error' && sample.phase === 'when';
            expect(receipt.body).toEqual(
              isReactionCondition
                ? { status: 'reproduced', reason: 'same_condition_failure' }
                : { status: 'blocked', reason: 'unsupported_phase' },
            );
            if (sample.id === 'inverted-age-range') {
              expect(
                (await get('diagnostics/events/' + diagnosticId + '/asset-repairs').expect(200))
                  .body,
              ).toEqual([
                {
                  kind: 'function',
                  lock: prepared.capabilityLock.pureFunctions['travel.isEligibleAge'],
                },
              ]);
            }
            if (sample.id === 'zero-divisor') {
              const candidate = await replay(diagnosticId, releaseId)
                .send({ proposeRepair: true })
                .expect(200);
              expect(candidate.body).toMatchObject({
                status: 'reproduced',
                repair: {
                  status: 'verified',
                  versionId,
                  pointer: '/reactions/0/when/args/1',
                },
              });
              expect(JSON.stringify(candidate.body)).not.toContain(record);
              expect(candidate.body.repair.candidateDigest).toMatch(/^[a-f0-9]{64}$/);
              expect(candidate.body).not.toHaveProperty('candidate');
              if (occurrence === 2) {
                const workRoute = 'forms/' + formId + '/work';
                const work = (
                  await post(workRoute, { name: '修复工作版本', source: versionId }).expect(201)
                ).body;
                const other = (
                  await post(workRoute, { name: '已偏离原配置', text: '{}' }).expect(201)
                ).body;
                const normalSave = await post('forms/' + formId + '/versions', {
                  workId: work.id,
                  basedOnVersionId: null,
                  text: JSON.stringify(config),
                }).expect(201);
                const expectedHead = normalSave.body.versionId as string;
                const input = {
                  workId: work.id,
                  expectedHead,
                  releaseId,
                  versionId,
                  candidateDigest: candidate.body.repair.candidateDigest,
                };
                const apply = (body: object, key = randomUUID()) =>
                  client
                    .post('/api/platform/diagnostics/events/' + diagnosticId + '/apply-repair')
                    .set('Cookie', cookie)
                    .set('Origin', origin)
                    .set('Idempotency-Key', key)
                    .send(body);
                await apply(input).set('Cookie', '').expect(401);
                await apply(input).set('Origin', 'http://127.0.0.1:4431').expect(403);
                await apply({ ...input, workId: other.id, expectedHead: null }).expect(409);
                await apply({ ...input, expectedHead: null }).expect(409);
                await apply({ ...input, candidateDigest: 'a'.repeat(64) }).expect(409);
                const keys = [randomUUID(), randomUUID()];
                const attempts = await Promise.all(keys.map((key) => apply(input, key)));
                expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
                const winner = attempts.findIndex(({ status }) => status === 201);
                const applied = attempts[winner]!.body;
                const seeded = (
                  await post(workRoute, {
                    name: '由原版本创建的空修订工作稿',
                    source: versionId,
                  }).expect(201)
                ).body;
                const seededApply = (
                  await apply({ ...input, workId: seeded.id, expectedHead: null }).expect(201)
                ).body;
                const seededSaved = (await get(workRoute + '/' + seeded.id).expect(200)).body;
                expect(seededSaved.head).toBe(seededApply.versionId);
                expect(seededSaved.history).toHaveLength(1);
                expect(seededSaved.version.basedOnVersionId).toBe(versionId);

                await db.execute(
                  "UPDATE platform_diagnostic_events SET received_at=now()-interval '8 days' WHERE id=$1",
                  [diagnosticId],
                );
                expect((await apply(input, keys[winner]!).expect(201)).body).toEqual(applied);
                await db.execute(
                  'UPDATE platform_diagnostic_events SET received_at=now() WHERE id=$1',
                  [diagnosticId],
                );
                await apply({ ...input, expectedHead: applied.versionId }, keys[winner]!).expect(
                  409,
                );
                const saved = (await get(workRoute + '/' + work.id).expect(200)).body;
                expect(saved.head).toBe(applied.versionId);
                expect(saved.history).toHaveLength(2);
                expect(saved.version.basedOnVersionId).toBe(expectedHead);
                expect(createHash('sha256').update(saved.text).digest('hex')).toBe(
                  input.candidateDigest,
                );
                expect(JSON.parse(saved.text).reactions[0].when.args[1].args[0].op).toBe('core.ne');
                expect((await get('releases/' + releaseId).expect(200)).body.preparedText).toBe(
                  delivery.preparedText,
                );
                expect(
                  (await get('forms/' + formId + '/versions/' + versionId).expect(200)).body.text,
                ).toBe(JSON.stringify(config));
              }
              expect((await get('releases/' + releaseId).expect(200)).body.preparedText).toBe(
                delivery.preparedText,
              );
              expect(
                (await get('forms/' + formId + '/versions/' + versionId).expect(200)).body.text,
              ).toBe(JSON.stringify(config));
            }
            if (isReactionCondition) {
              reproduced++;
              if (reproduced === 1) {
                await replay(diagnosticId, releaseId, 'another-space').expect(403);
                await replay(diagnosticId, randomUUID()).expect(404);
                await replay(diagnosticId, releaseId).set('X-Agent-Service-Token', '').expect(401);
                await replay(diagnosticId, releaseId).set('X-Agent-User', '').expect(403);
                const audit = await db.one(
                  'SELECT count(*) AS count FROM platform_diagnostic_reads WHERE event_id=$1 AND user_id=$2',
                  [diagnosticId, 'corpus-admin'],
                );
                expect(audit?.count).toBe(2);

                // Withdrawing a recommendation must not prevent replay using the installed implementation.
                const builds = module.get(ReleaseBuild);
                const installed = builds.assets.installed;
                const eq = installed.pureFunctions['core.eq']!;
                const policy = new WebAssetCatalog(
                  installed,
                  [],
                  [
                    {
                      kind: 'pureFunctions',
                      id: 'core.eq',
                      version: eq.manifest.version,
                      artifactDigest: eq.artifact.digest,
                      policy: 'retain-only',
                    },
                  ],
                );
                const capture = builds.capture.bind(builds);
                const overridden = vi
                  .spyOn(builds, 'capture')
                  .mockImplementation((target, catalog = policy.recommended, selections) =>
                    capture(target, catalog, selections),
                  );
                try {
                  expect((await replay(diagnosticId, releaseId).expect(200)).body).toMatchObject({
                    status: 'reproduced',
                  });
                } finally {
                  overridden.mockRestore();
                }
                const environment = await db.one<{ requestId: string; input: string }>(
                  `SELECT r.request_id AS "requestId", rq.build_input AS input
                    FROM platform_releases r JOIN platform_release_requests rq USING(request_id)
                    WHERE r.release_id=$1`,
                  [releaseId],
                );
                const setBuildInput = (input: string) =>
                  db.execute(
                    'UPDATE platform_release_requests SET build_input=$1 WHERE request_id=$2',
                    [input, environment!.requestId],
                  );
                await setBuildInput('{}');
                expect(
                  (await replay(diagnosticId, releaseId).send({ proposeRepair: true }).expect(200))
                    .body,
                ).toEqual({
                  status: 'reproduced',
                  reason: 'same_condition_failure',
                  repair: {
                    status: 'blocked',
                    reason: 'original_build_unavailable',
                  },
                });
                await setBuildInput(environment!.input);

                const replaceEvidence = (evidence: object) =>
                  db.execute(
                    'UPDATE platform_diagnostic_evidence SET evidence=$1 WHERE event_id=$2',
                    [JSON.stringify(evidence), diagnosticId],
                  );
                const original = diagnostic.evidence;
                await replaceEvidence({
                  ...original,
                  error: { name: 'Error', message: 'private different error' },
                });
                expect((await replay(diagnosticId, releaseId).expect(200)).body).toEqual({
                  status: 'not_reproduced',
                  reason: 'condition_failure_differed',
                });
                await replaceEvidence({
                  ...original,
                  input: {
                    ...original.input,
                    snapshot: { scenario: 'safe', record, amount: 10, result: 0 },
                  },
                });
                expect((await replay(diagnosticId, releaseId).expect(200)).body).toEqual({
                  status: 'not_reproduced',
                  reason: 'condition_failure_differed',
                });
                await replaceEvidence({
                  ...original,
                  input: { ...original.input, event: {} },
                });
                expect((await replay(diagnosticId, releaseId).expect(200)).body).toEqual({
                  status: 'blocked',
                  reason: 'unsupported_input',
                });
                await replaceEvidence({ ...original, prepared: {} });
                expect((await replay(diagnosticId, releaseId).expect(200)).body).toEqual({
                  status: 'blocked',
                  reason: 'evidence_mismatch',
                });

                const unavailable = JSON.parse(delivery.preparedText) as PreparedForm;
                unavailable.capabilityLock.pureFunctions['core.eq']!.artifact.digest =
                  `sha256:${'a'.repeat(64)}`;
                const setRelease = (text: string) =>
                  db.execute(
                    'UPDATE platform_releases SET prepared_text=$1,digest=$2 WHERE release_id=$3',
                    [text, 'sha256:' + createHash('sha256').update(text).digest('hex'), releaseId],
                  );
                const unguarded = JSON.parse(delivery.preparedText) as PreparedForm;
                const unguardedRule = unguarded.definition.reactions!.find(
                  ({ id }) => id === sample.id,
                )!;
                const condition = unguardedRule.when as CallExpression;
                condition.args[1] = (condition.args[1] as CallExpression).args[0]!;
                await setRelease(JSON.stringify(unguarded));
                await replaceEvidence({ ...original, prepared: unguarded });
                expect(
                  (await replay(diagnosticId, releaseId).send({ proposeRepair: true }).expect(200))
                    .body,
                ).toEqual({ status: 'reproduced', reason: 'same_condition_failure' });

                await setRelease(JSON.stringify(unavailable));
                await replaceEvidence({ ...original, prepared: unavailable });
                expect((await replay(diagnosticId, releaseId).expect(200)).body).toEqual({
                  status: 'blocked',
                  reason: 'environment_unavailable',
                });
                const expansive = JSON.parse(delivery.preparedText) as PreparedForm;
                const expressions = (expansive.definition.expressions ??= {});
                expressions['leaf'] = true;
                let previous = 'leaf';
                for (let depth = 1; depth <= 12; depth++) {
                  const name = 'layer' + depth;
                  expressions[name] = {
                    op: 'core.and',
                    args: [{ use: previous }, { use: previous }],
                  };
                  previous = name;
                }
                expansive.definition.reactions!.find(({ id }) => id === sample.id)!.when = {
                  use: previous,
                };
                await setRelease(JSON.stringify(expansive));
                await replaceEvidence({ ...original, prepared: expansive });
                expect((await replay(diagnosticId, releaseId).expect(200)).body).toEqual({
                  status: 'blocked',
                  reason: 'condition_budget_exceeded',
                });
                await setRelease(delivery.preparedText);
                await replaceEvidence(original);

                await db.execute(
                  "UPDATE platform_diagnostic_events SET received_at=now()-interval '8 days' WHERE id=$1",
                  [diagnosticId],
                );
                expect((await replay(diagnosticId, releaseId).expect(200)).body).toEqual({
                  status: 'blocked',
                  reason: 'evidence_unavailable',
                });
                await db.execute(
                  'UPDATE platform_diagnostic_events SET received_at=now() WHERE id=$1',
                  [diagnosticId],
                );
              }
            }
            const { body: detail } = await get('diagnostics/events/' + diagnosticId).expect(200);
            expect(detail).toMatchObject({
              formId,
              releaseId,
              versionId,
              errorCode: sample.code,
              phase: sample.phase,
              targetId: sample.kind === 'loop' ? null : sample.id,
              evidence: { input: { snapshot: { record } } },
            });
            errors.push({
              caseId: sample.id,
              label: sample.label,
              expectedError: sample.error,
              ...detail,
            });
          } finally {
            runtime.dispose();
          }
        }
      }
      const { body: groups } = await get('diagnostics/groups?releaseId=' + releaseId).expect(200);
      expect((groups as Array<{ count: number }>).map(({ count }) => count).sort()).toEqual([2, 3]);
      fixtures.push({ name: form.name, formId, versionId, releaseId, config, groups, errors });
    }
    expect(fixtures).toHaveLength(10);
    expect(signatures.size).toBe(20);
    expect(diagnosticIds.size).toBe(50);
    expect(reproduced).toBe(15);
    const output = process.env.FORM_DIAGNOSTIC_CORPUS_OUTPUT;
    if (output) {
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, JSON.stringify({ format: 2, fixtures }, null, 2) + '\n');
    }
  } finally {
    await app.close();
    vi.unstubAllEnvs();
  }
}, 120_000);
