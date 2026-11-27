import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import {
  Body,
  BadRequestException,
  Controller,
  ConflictException,
  ForbiddenException,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Param,
} from '@nestjs/common';
import { findNodeAtLocation, parseTree } from 'jsonc-parser';
import type { CompilerInputDefinition, Expression } from '@form-engine/protocol/definition';
import type { PreparedForm, ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import {
  createArrayCountNormalizedText,
  createArraySumProducts,
  createCoreFunctions,
  createDateAgeInYears,
  createDateInclusiveDays,
  createTextIsNonBlank,
  createTravelIsEligibleAge,
  createTravelIsTripRangeAllowed,
  createTravelPersonPremium,
  createTravelRequiresGuardian,
  createTravelTotalPremium,
} from '@form-engine/pure-functions';
import { createRuntime, SUPPORTED_PREPARED_FORMAT, type ReadResult } from '@form-engine/runtime';
import { PlatformAccess } from './access.js';
import { requireAgent } from './create-form-agent.js';
import { PlatformForms } from './forms.js';
import { resourceId } from './form-drafts.js';
import { requireStudioOrigin, session } from './session-http.js';
import { PlatformDatabase } from './database.js';
import { moveDivisionGuard } from './diagnostic-condition-repair.js';
import { readDiagnosticReference } from './diagnostic-reference.js';
import { ReleaseBuild, type ReleaseBuildInput } from './release-build.js';

type BlockReason =
  | 'evidence_unavailable'
  | 'unsupported_phase'
  | 'evidence_mismatch'
  | 'unsupported_input'
  | 'condition_budget_exceeded'
  | 'environment_unavailable';
type ReplayOutcome =
  | { status: 'blocked'; reason: BlockReason }
  | {
      status: 'reproduced';
      reason: 'same_condition_failure';
      repair?:
        | { status: 'verified'; versionId: string; pointer: string; candidateDigest: string }
        | { status: 'blocked'; reason: 'original_build_unavailable' | 'candidate_check_failed' };
    }
  | { status: 'not_reproduced'; reason: 'condition_failure_differed' };

type ReplayResult = ReplayOutcome & { candidate?: { text: string; originalText: string } };

function blocked(reason: BlockReason): ReplayOutcome {
  return { status: 'blocked', reason };
}

type Evidence = {
  phase?: string;
  execution?: { kind?: string; ruleId?: string };
  input?: {
    snapshot?: unknown;
    context?: unknown;
    event?: unknown;
    scope?: object;
    validationReads?: unknown;
  };
  error?: { name?: string; message?: string };
};

function conditionBlock(
  root: Expression,
  named: Record<string, Expression>,
): BlockReason | undefined {
  // The evaluator expands every named reference, including repeated visits to the same expression.
  // Count expanded work before handing it to the synchronous Runtime evaluator.
  const maxNodes = 2_048;
  const maxDepth = 64;
  const pending = [{ expression: root, depth: 1 }];
  let remaining = maxNodes;
  while (pending.length > 0) {
    const { expression, depth } = pending.pop()!;
    if (--remaining < 0 || depth > maxDepth) return 'condition_budget_exceeded';
    if (expression === null || typeof expression !== 'object') continue;
    if ('ref' in expression) {
      const { ref } = expression;
      if (ref.source !== 'context' && (ref.source !== 'data' || 'scope' in ref))
        return 'unsupported_input';
    } else if ('use' in expression) {
      if (!Object.hasOwn(named, expression.use)) return 'evidence_mismatch';
      pending.push({ expression: named[expression.use]!, depth: depth + 1 });
    } else if ('op' in expression) {
      if (expression.args.length + pending.length > remaining) return 'condition_budget_exceeded';
      for (const arg of expression.args) pending.push({ expression: arg, depth: depth + 1 });
    }
  }
}
// Re-evaluate only the original condition in the captured frame. Never flush a replay instance.
async function replayCondition(
  source: {
    preparedText: string;
    digest: string;
    targetId: string;
    evidence: Evidence;
    versionId: string;
    repairSource: { text: Buffer; buildInput: string } | null | undefined;
  },
  builds: ReleaseBuild,
): Promise<ReplayResult> {
  const { preparedText: text, digest, targetId, evidence } = source;
  if (
    digest !== 'sha256:' + createHash('sha256').update(text).digest('hex') ||
    evidence.phase !== 'when' ||
    evidence.execution?.kind !== 'reaction' ||
    evidence.execution.ruleId !== targetId ||
    typeof evidence.error?.name !== 'string' ||
    typeof evidence.error.message !== 'string' ||
    !evidence.input ||
    evidence.input.snapshot === undefined ||
    evidence.input.context === undefined ||
    !evidence.input.scope ||
    typeof evidence.input.scope !== 'object'
  )
    return blocked('evidence_mismatch');
  const { input, error } = evidence;
  const prepared = JSON.parse(text) as PreparedForm;
  const rule = prepared.definition.reactions?.find(({ id }) => id === targetId);
  if (rule?.when === undefined) return blocked('evidence_mismatch');
  if (
    rule.scope ||
    Object.keys(input.scope!).length > 0 ||
    input.event !== undefined ||
    input.validationReads !== undefined
  )
    return blocked('unsupported_input');
  const conditionLimit = conditionBlock(rule.when, prepared.definition.expressions ?? {});
  if (conditionLimit) return blocked(conditionLimit);

  const { platform } = prepared.build;
  if (platform !== 'web' || prepared.preparedFormatVersion !== SUPPORTED_PREPARED_FORMAT)
    return blocked('environment_unavailable');
  const artifact = builds.assets.installed.pureFunctions['core.eq']!.artifact;
  const functions = {
    ...createCoreFunctions(artifact),
    ...Object.fromEntries(
      [
        createArrayCountNormalizedText,
        createArraySumProducts,
        createDateAgeInYears,
        createDateInclusiveDays,
        createTextIsNonBlank,
        createTravelIsEligibleAge,
        createTravelIsTripRangeAllowed,
        createTravelPersonPremium,
        createTravelRequiresGuardian,
        createTravelTotalPremium,
      ].map((create) => {
        const binding = create(artifact);
        return [binding.manifest.id, binding];
      }),
    ),
  };
  const evaluate = (
    artifact: ReadonlyPreparedForm,
    condition: Expression,
  ): ReadResult | undefined => {
    // Runtime verifies the installed function lock. Synchronous disposal cancels queued work.
    const runtime = createRuntime({
      prepared: artifact,
      functions,
      data: input.snapshot,
      context: input.context,
      traceCapacity: 0,
    });
    try {
      if (isDeepStrictEqual(runtime.snapshot(), input.snapshot)) return runtime.evaluate(condition);
    } finally {
      runtime.dispose();
    }
  };

  let result: ReadResult | undefined;
  try {
    result = evaluate(prepared, rule.when);
  } catch {
    return blocked('environment_unavailable');
  }
  if (!result) return blocked('unsupported_input');
  // Match the Runtime's boolean gate, including its two errors outside plain expression values.
  const replayError =
    result.kind === 'error'
      ? result.error
      : result.kind === 'missing'
        ? 'Error: expression: missing value'
        : typeof result.value !== 'boolean'
          ? 'Error: expression: boolean required'
          : undefined;
  if (
    replayError !==
    (error.name === 'ThrownValue' ? error.message : error.name + ': ' + error.message)
  )
    return { status: 'not_reproduced', reason: 'condition_failure_differed' };
  const reproduced = { status: 'reproduced', reason: 'same_condition_failure' } as const;
  const { repairSource } = source;
  if (repairSource === undefined || replayError !== 'Error: function: division by zero')
    return reproduced;
  const repair = moveDivisionGuard(rule.when);
  if (!repair) return reproduced;
  const repairBlocked = (
    reason: 'original_build_unavailable' | 'candidate_check_failed',
  ): ReplayOutcome => ({ ...reproduced, repair: { status: 'blocked', reason } });
  if (!repairSource) return repairBlocked('original_build_unavailable');

  let checked: Awaited<ReturnType<ReleaseBuild['compile']>>;
  let candidatePointer: string;
  let candidateText: string;
  const originalText = repairSource.text.toString('utf8');
  try {
    const definition = JSON.parse(originalText) as CompilerInputDefinition;
    const index = definition.reactions?.findIndex(({ id }) => id === targetId) ?? -1;
    const original = definition.reactions?.[index];
    if (!original || !isDeepStrictEqual(original.when, rule.when))
      return repairBlocked('original_build_unavailable');
    const argsPath = [
      'reactions',
      index,
      'when',
      ...repair.path
        .split('/')
        .slice(1)
        .map((part) => (part === 'args' ? part : Number(part))),
      'args',
    ];
    const args = findNodeAtLocation(parseTree(originalText)!, argsPath);
    const [left, right] = args?.children ?? [];
    if (!left || !right) return repairBlocked('original_build_unavailable');
    candidateText =
      originalText.slice(0, left.offset) +
      originalText.slice(right.offset, right.offset + right.length) +
      originalText.slice(left.offset + left.length, right.offset) +
      originalText.slice(left.offset, left.offset + left.length) +
      originalText.slice(right.offset + right.length);

    const buildInput = JSON.parse(repairSource.buildInput) as ReleaseBuildInput;
    checked = await builds.compile(candidateText, buildInput);
    candidatePointer = '/reactions/' + index + '/when' + repair.path;
  } catch {
    return repairBlocked('original_build_unavailable');
  }
  if (!checked.success) return repairBlocked('candidate_check_failed');
  try {
    // Bind the proof to the original compiled form with only the known rewrite applied.
    rule.when = repair.expression;
    if (
      !isDeepStrictEqual(checked.prepared.build, prepared.build) ||
      checked.prepared.preparedFormatVersion !== prepared.preparedFormatVersion ||
      !isDeepStrictEqual(checked.prepared.definition, prepared.definition) ||
      !isDeepStrictEqual(checked.prepared.resources.schemas, prepared.resources.schemas) ||
      !isDeepStrictEqual(checked.prepared.capabilityLock, prepared.capabilityLock) ||
      !isDeepStrictEqual(checked.prepared.hostRequirements, prepared.hostRequirements)
    )
      return repairBlocked('candidate_check_failed');
    const verified = evaluate(checked.prepared, repair.expression);
    if (verified?.kind !== 'value' || verified.value !== false)
      return repairBlocked('candidate_check_failed');
    return {
      ...reproduced,
      repair: {
        status: 'verified',
        versionId: source.versionId,
        pointer: candidatePointer,
        candidateDigest: createHash('sha256').update(candidateText).digest('hex'),
      },
      candidate: { text: candidateText, originalText },
    };
  } catch {
    return repairBlocked('candidate_check_failed');
  }
}

@Controller()
export class DiagnosticReplayController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly db: PlatformDatabase,
    private readonly builds: ReleaseBuild,
    private readonly forms: PlatformForms,
  ) {}

  @Post('internal/agent-tools/replay-diagnostic')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async replay(
    @Headers('x-agent-service-token') token: string | undefined,
    @Headers('x-agent-user') user: string | undefined,
    @Headers('x-agent-space') space: string | undefined,
    @Body() body: { diagnosticId: string; releaseId: string; proposeRepair?: boolean },
  ): Promise<ReplayOutcome> {
    requireAgent(token);
    if (!user || !space) throw new ForbiddenException();
    const result = await this.runReplay(user, space, body);
    if (result.status === 'reproduced') {
      const { status, reason, repair } = result;
      return { status, reason, ...(repair && { repair }) };
    }
    return result;
  }

  @Post('api/platform/diagnostics/events/:id/apply-repair')
  @Header('Cache-Control', 'no-store')
  async apply(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id') diagnosticId: string,
    @Body()
    input: {
      workId?: unknown;
      expectedHead?: unknown;
      releaseId?: unknown;
      versionId?: unknown;
      candidateDigest?: unknown;
    },
  ) {
    requireStudioOrigin(origin);
    const token = session(cookie);
    const actor = await this.access.authenticate(token, 'form:edit');
    if (!actor.permissions.includes('diagnostic:view')) throw new ForbiddenException();
    const ref = await readDiagnosticReference(this.db.executor, actor.spaceId, diagnosticId);
    if (ref.releaseId !== input?.releaseId || ref.versionId !== input.versionId)
      throw new ConflictException('候选的原发布或配置版本已改变。');
    if (typeof input.candidateDigest !== 'string' || !/^[0-9a-f]{64}$/.test(input.candidateDigest))
      throw new BadRequestException('无效的修复候选。');
    const workId = resourceId(input.workId);
    const expectedHead = input.expectedHead === null ? null : resourceId(input.expectedHead);

    return this.forms.applyDiagnosticRepair(
      token,
      key,
      {
        formId: ref.formId,
        workId,
        expectedHead,
        diagnosticId: ref.diagnosticId,
        releaseId: ref.releaseId,
        versionId: ref.versionId,
        candidateDigest: input.candidateDigest,
      },
      async () => {
        const result = await this.runReplay(actor.userId, actor.spaceId, {
          diagnosticId: ref.diagnosticId,
          releaseId: ref.releaseId,
          proposeRepair: true,
        });
        if (
          result.status !== 'reproduced' ||
          result.repair?.status !== 'verified' ||
          result.repair.candidateDigest !== input.candidateDigest ||
          !result.candidate
        )
          throw new ConflictException('无法复验已确认的修复候选，请重新调查。');
        return result.candidate;
      },
    );
  }

  private async runReplay(
    user: string,
    space: string,
    body: { diagnosticId: string; releaseId: string; proposeRepair?: boolean },
  ): Promise<ReplayResult> {
    const source = await this.db.transaction(async (tx) => {
      const actor = await this.access.contextForUser(user, tx);
      if (actor.spaceId !== space || !actor.permissions.includes('diagnostic:view'))
        throw new ForbiddenException();
      const ref = await readDiagnosticReference(tx, actor.spaceId, body?.diagnosticId);
      if (ref.releaseId !== body.releaseId) throw new NotFoundException();
      if (ref.errorCode !== 'reaction.error' || ref.phase !== 'when' || !ref.targetId)
        return blocked('unsupported_phase');
      if (ref.evidenceStatus !== 'captured') return blocked('evidence_unavailable');
      const row = await tx.one<{
        evidence: Evidence;
        preparedText: string;
        digest: string;
        matches: boolean;
      }>(
        `SELECT ev.evidence, r.prepared_text AS "preparedText", r.digest,
            CASE WHEN pg_input_is_valid((ev.evidence->'prepared')::text, 'jsonb')
                AND pg_input_is_valid(r.prepared_text, 'jsonb')
              THEN (ev.evidence->'prepared')::jsonb = r.prepared_text::jsonb
              ELSE false END AS matches
          FROM platform_diagnostic_events e
          JOIN platform_diagnostic_evidence ev ON ev.event_id=e.id
          JOIN platform_releases r USING(release_id)
          WHERE e.id=$1 AND r.release_id=$2 AND e.received_at >= now() - interval '7 days'`,
        [ref.diagnosticId, ref.releaseId],
      );
      if (!row) return blocked('evidence_unavailable');
      await tx.execute('INSERT INTO platform_diagnostic_reads (event_id, user_id) VALUES ($1,$2)', [
        ref.diagnosticId,
        actor.userId,
      ]);
      if (!row.matches) return blocked('evidence_mismatch');
      const repairSource =
        body.proposeRepair === true && actor.permissions.includes('form:edit')
          ? ((await tx.one<{ text: Buffer; buildInput: string }>(
              `SELECT v.text, rq.build_input AS "buildInput"
                FROM platform_releases r
                JOIN platform_versions v ON v.form_id=r.form_id AND v.version_id=r.version_id
                JOIN platform_release_requests rq ON rq.request_id=r.request_id
                WHERE r.release_id=$1`,
              [ref.releaseId],
            )) ?? null)
          : undefined;
      return {
        ...row,
        targetId: ref.targetId,
        versionId: ref.versionId,
        repairSource,
      };
    });
    if ('status' in source) return source;
    const result = await replayCondition(source, this.builds);
    const actor = await this.access.contextForUser(user);
    if (actor.spaceId !== space || !actor.permissions.includes('diagnostic:view'))
      throw new ForbiddenException();
    return result;
  }
}
