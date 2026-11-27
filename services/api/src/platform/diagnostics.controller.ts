import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  Inject,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { PreparedForm, PreparedViewNode } from '@form-engine/protocol/prepared';
import { PlatformAccess, tokenHash } from './access.js';
import { PlatformDatabase } from './database.js';
import { readDiagnosticAssets } from './diagnostic-assets.js';
import { listDiagnosticReferences, readDiagnosticReference } from './diagnostic-reference.js';
import { requireStudioOrigin, session } from './session-http.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fingerprintPattern = /^[0-9a-f]{64}$/;
type DiagnosticTargetKind = 'reaction' | 'constraint' | 'material_node';
const mappings = new Map<string, { phases: readonly string[]; targetKind?: DiagnosticTargetKind }>([
  ['reaction.error', { phases: ['when', 'execute'], targetKind: 'reaction' }],
  ['reaction.action.error', { phases: ['action', 'payload', 'invoke'], targetKind: 'reaction' }],
  ['validation.error', { phases: ['when', 'requires', 'assert'], targetKind: 'constraint' }],
  ['validator.error', { phases: ['invoke', 'result'], targetKind: 'constraint' }],
  ['flush.aborted', { phases: ['flush'] }],
  ['MATERIAL_UNAVAILABLE', { phases: ['render'], targetKind: 'material_node' }],
]);
const missingStates = ['missing', 'too_large', 'serialization_failed'];
const maxEvidenceBytes = 512 * 1024;

function identifier(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new BadRequestException('Invalid ID');
  return value.toLowerCase();
}

function parseEvent(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BadRequestException();
  const event = body as Record<string, unknown>;
  const { source, phase, errorCode, targetKind, targetId, occurredAt, evidence, evidenceStatus } =
    event;
  const mapping = typeof errorCode === 'string' ? mappings.get(errorCode) : undefined;
  if (
    event.schemaVersion !== 1 ||
    typeof errorCode !== 'string' ||
    typeof phase !== 'string' ||
    !mapping?.phases.includes(phase) ||
    source !== (errorCode === 'MATERIAL_UNAVAILABLE' ? 'renderer' : 'runtime') ||
    (targetId === undefined
      ? targetKind !== undefined
      : typeof targetId !== 'string' ||
        !targetId.length ||
        targetId.length > 256 ||
        !mapping.targetKind ||
        targetKind !== mapping.targetKind) ||
    typeof occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(occurredAt)) ||
    typeof evidenceStatus !== 'string'
  )
    throw new BadRequestException('Invalid diagnostic event');

  const serialized = evidence === undefined ? undefined : JSON.stringify(evidence);
  if (
    evidenceStatus === 'captured'
      ? !evidence ||
        typeof evidence !== 'object' ||
        Array.isArray(evidence) ||
        !serialized ||
        Buffer.byteLength(serialized) > maxEvidenceBytes
      : serialized !== undefined || !missingStates.includes(evidenceStatus)
  )
    throw new BadRequestException('Invalid diagnostic evidence');

  return {
    eventId: identifier(event.eventId),
    releaseId: identifier(event.releaseId),
    occurredAt: new Date(occurredAt).toISOString(),
    source,
    phase,
    errorCode,
    targetId: typeof targetId === 'string' ? targetId : undefined,
    targetKind: targetId === undefined ? undefined : mapping.targetKind,
    evidenceStatus,
    serialized,
  };
}

function hasMaterialNode(node: PreparedViewNode, id: string): boolean {
  if ('material' in node)
    return (
      node.id === id ||
      Object.values(node.slots ?? {})
        .flat()
        .some((child) => hasMaterialNode(child, id))
    );
  return 'node' in node && hasMaterialNode(node.node, id);
}

function validateTarget(
  kind: DiagnosticTargetKind | undefined,
  id: string | undefined,
  text: string,
) {
  if (!kind || !id) return;
  const { definition } = JSON.parse(text) as PreparedForm;
  const found =
    kind === 'material_node'
      ? [
          ...Object.values(definition.views),
          ...Object.values(definition.viewTemplates ?? {}).map((template) => template.node),
        ].some((node) => hasMaterialNode(node, id))
      : (kind === 'reaction' ? definition.reactions : definition.constraints)?.some(
          (rule) => rule.id === id,
        );
  if (!found) throw new BadRequestException('Target is absent from the published form');
}

function hash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

@Controller('api/platform/diagnostics')
export class DiagnosticsController implements OnModuleInit, OnModuleDestroy {
  private cleanup?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(DiagnosticsController.name);

  constructor(
    @Inject(PlatformAccess) private readonly access: PlatformAccess,
    @Inject(PlatformDatabase) private readonly db: PlatformDatabase,
  ) {}

  onModuleInit() {
    this.cleanup = setInterval(() => {
      void this.expire().catch(() => this.logger.warn('Diagnostic retention cleanup failed'));
    }, 60 * 1000);
    this.cleanup.unref();
  }

  onModuleDestroy() {
    clearInterval(this.cleanup);
  }

  private async expire() {
    await this.db.executor.execute(`
      DELETE FROM platform_diagnostic_evidence WHERE event_id IN (
        SELECT ev.event_id FROM platform_diagnostic_evidence ev
        JOIN platform_diagnostic_events e ON e.id=ev.event_id
        WHERE e.received_at < now() - interval '7 days'
        ORDER BY e.received_at, e.id LIMIT 500
      )
    `);
    await this.db.executor.execute(`
      DELETE FROM platform_diagnostic_events WHERE id IN (
        SELECT id FROM platform_diagnostic_events
        WHERE received_at < now() - interval '30 days' ORDER BY received_at LIMIT 500
      )
    `);
  }

  private async pilot(cookie: string | undefined) {
    if (process.env.PLATFORM_DIAGNOSTICS_STUDIO_PILOT !== '1') throw new NotFoundException();
    return this.access.authenticate(session(cookie), 'diagnostic:view');
  }

  @Header('Cache-Control', 'no-store')
  @Get('pilot')
  async pilotStatus(@Headers('cookie') cookie?: string) {
    const context = await this.pilot(cookie);
    return { owner: this.owner(context.spaceId, session(cookie)!) };
  }

  private owner(spaceId: string, token: string) {
    return hash(['diagnostic-pilot', spaceId, tokenHash(token)]);
  }

  @Post('pilot/events')
  async receivePilot(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Headers('x-diagnostic-owner') owner: string | undefined,
    @Body() body: unknown,
  ) {
    requireStudioOrigin(origin);
    const context = await this.pilot(cookie);
    if (owner !== this.owner(context.spaceId, session(cookie)!)) throw new ForbiddenException();
    return this.receive(body, 'studio-example', 'f.space_id', context.spaceId);
  }

  @Post('events')
  async receiveHost(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ) {
    const secret = process.env.PLATFORM_DIAGNOSTICS_HOST_TOKEN;
    const form = process.env.PLATFORM_DIAGNOSTICS_HOST_FORM_ID;
    const host = process.env.PLATFORM_DIAGNOSTICS_HOST_ID;
    if (!secret || !form || !host || host === 'studio-example') throw new NotFoundException();
    const supplied = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!timingSafeEqual(Buffer.from(tokenHash(supplied)), Buffer.from(tokenHash(secret))))
      throw new UnauthorizedException();
    return this.receive(body, host, 'f.form_id', form);
  }

  private async receive(
    body: unknown,
    host: string,
    scope: 'f.space_id' | 'f.form_id',
    value: string,
  ) {
    const { targetKind, ...event } = parseEvent(body);
    const target = event.targetId ?? null;
    const fingerprint = hash([event.source, event.phase, event.errorCode, target]);
    // The validated kind is fixed by the error code. Keep retries compatible with stored digests.
    const requestDigest = hash(event);
    return this.db
      .transaction(async (tx) => {
        const release = await tx.one<{ prepared_text: string }>(
          `
        SELECT r.prepared_text FROM platform_releases r JOIN platform_forms f USING(form_id)
        WHERE r.release_id=$1 AND ${scope}=$2
      `,
          [event.releaseId, value],
        );
        if (!release) throw new NotFoundException();
        validateTarget(targetKind, event.targetId, release.prepared_text);

        const previous = await tx.one<{ id: string; request_digest: string }>(
          `
        SELECT id, request_digest FROM platform_diagnostic_events WHERE host_id=$1 AND event_id=$2
      `,
          [host, event.eventId],
        );
        if (previous) {
          if (previous.request_digest !== requestDigest)
            throw new ConflictException('Diagnostic ID reused');
          return { diagnosticId: previous.id };
        }

        const rate = await tx.one<{ count: number }>(
          `
        SELECT count(*) AS count FROM platform_diagnostic_events
        WHERE host_id=$1 AND received_at > now() - interval '1 minute'
      `,
          [host],
        );
        if (rate && rate.count >= 60)
          throw new HttpException('Diagnostic intake rate exceeded', HttpStatus.TOO_MANY_REQUESTS);

        const id = randomUUID();
        await tx.execute(
          `
        INSERT INTO platform_diagnostic_events
        (id, host_id, event_id, release_id, occurred_at, source, phase, error_code, target_id,
         fingerprint, request_digest, evidence_status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      `,
          [
            id,
            host,
            event.eventId,
            event.releaseId,
            event.occurredAt,
            event.source,
            event.phase,
            event.errorCode,
            target,
            fingerprint,
            requestDigest,
            event.evidenceStatus,
          ],
        );
        if (event.serialized !== undefined) {
          await tx.execute(
            'INSERT INTO platform_diagnostic_evidence (event_id, evidence) VALUES ($1,$2)',
            [id, event.serialized],
          );
        }
        return { diagnosticId: id };
      })
      .catch((error: unknown) => {
        if (error instanceof HttpException) throw error;
        // A driver error can include details derived from the raw evidence.
        this.logger.error('Diagnostic persistence failed');
        throw new InternalServerErrorException('Diagnostic persistence failed');
      });
  }

  @Header('Cache-Control', 'no-store')
  @Get('groups')
  async groups(
    @Headers('cookie') cookie: string | undefined,
    @Query('releaseId') releaseId?: string,
  ) {
    const { spaceId } = await this.access.authenticate(session(cookie), 'diagnostic:view');
    return this.db.executor.many(
      `
      SELECT e.release_id AS "releaseId", f.name AS "formName", e.fingerprint, e.source, e.phase,
        e.error_code AS "errorCode", e.target_id AS "targetId", count(*) AS count,
        min(e.received_at) AS "firstReceivedAt", max(e.received_at) AS "lastReceivedAt"
      FROM platform_diagnostic_events e JOIN platform_releases r USING(release_id)
      JOIN platform_forms f USING(form_id)
      WHERE f.space_id=$1 AND e.received_at >= now() - interval '30 days'
        AND ($2::text IS NULL OR e.release_id=$2)
      GROUP BY e.release_id, f.name, e.fingerprint, e.source, e.phase, e.error_code, e.target_id
      ORDER BY max(e.received_at) DESC, e.release_id, e.fingerprint LIMIT 100
    `,
      [spaceId, releaseId === undefined ? null : identifier(releaseId)],
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('groups/:releaseId/:fingerprint')
  async events(
    @Headers('cookie') cookie: string | undefined,
    @Param('releaseId') releaseId: string,
    @Param('fingerprint') fingerprint: string,
  ) {
    const { spaceId } = await this.access.authenticate(session(cookie), 'diagnostic:view');
    if (!fingerprintPattern.test(fingerprint)) throw new BadRequestException();
    return this.db.executor.many(
      `
      SELECT e.id AS "diagnosticId", e.occurred_at AS "occurredAt", e.received_at AS "receivedAt",
        e.host_id AS "hostId", CASE WHEN e.evidence_status='captured'
        AND e.received_at < now() - interval '7 days' THEN 'expired'
        ELSE e.evidence_status END AS "evidenceStatus"
      FROM platform_diagnostic_events e JOIN platform_releases r USING(release_id)
      JOIN platform_forms f USING(form_id)
      WHERE f.space_id=$1 AND e.release_id=$2 AND e.fingerprint=$3
        AND e.received_at >= now() - interval '30 days'
      ORDER BY e.received_at DESC, e.id DESC LIMIT 100
    `,
      [spaceId, identifier(releaseId), fingerprint],
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('references')
  async references(
    @Headers('cookie') cookie: string | undefined,
    @Query('q') query: unknown = '',
    @Query('page') pageText: unknown = '1',
    @Query('limit') limitText: unknown = '8',
  ) {
    const { spaceId } = await this.access.authenticate(session(cookie), 'diagnostic:view');
    if (
      typeof query !== 'string' ||
      query.length > 200 ||
      typeof pageText !== 'string' ||
      !/^\d{1,6}$/.test(pageText) ||
      typeof limitText !== 'string' ||
      !/^\d{1,2}$/.test(limitText)
    )
      throw new BadRequestException('Invalid diagnostic reference query');
    const page = Number(pageText);
    const limit = Number(limitText);
    if (page < 1 || limit < 1 || limit > 32)
      throw new BadRequestException('Invalid diagnostic reference pagination');
    return listDiagnosticReferences(
      this.db.executor,
      spaceId,
      query.trim(),
      limit,
      (page - 1) * limit,
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('events/:id/reference')
  async reference(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    const { spaceId } = await this.access.authenticate(session(cookie), 'diagnostic:view');
    return readDiagnosticReference(this.db.executor, spaceId, id);
  }

  @Header('Cache-Control', 'no-store')
  @Get('events/:id')
  async detail(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    const eventId = identifier(id);
    return this.db.transaction(async (tx) => {
      const { spaceId, userId } = await this.access.authenticate(
        session(cookie),
        'diagnostic:view',
        tx,
      );
      const row = await tx.one<{
        releaseId: string;
        errorCode: string;
        phase: string;
        targetId: string | null;
        evidence: unknown;
      }>(
        `
        SELECT e.release_id AS "releaseId", r.version_id AS "versionId", f.form_id AS "formId",
          e.error_code AS "errorCode", e.phase, e.target_id AS "targetId", e.occurred_at AS "occurredAt",
          CASE WHEN e.evidence_status='captured' AND e.received_at < now() - interval '7 days'
            THEN 'expired' ELSE e.evidence_status END AS "evidenceStatus", ev.evidence
        FROM platform_diagnostic_events e JOIN platform_releases r USING(release_id)
        JOIN platform_forms f USING(form_id) LEFT JOIN platform_diagnostic_evidence ev
          ON ev.event_id=e.id AND e.received_at >= now() - interval '7 days'
        WHERE f.space_id=$1 AND e.id=$2 AND e.received_at >= now() - interval '30 days'
      `,
        [spaceId, eventId],
      );
      if (!row) throw new NotFoundException();
      if (row.evidence != null) {
        await tx.execute(
          'INSERT INTO platform_diagnostic_reads (event_id, user_id) VALUES ($1,$2)',
          [eventId, userId],
        );
      }
      const assetCandidates = await readDiagnosticAssets(tx, row);
      return { diagnosticId: eventId, ...row, ...(assetCandidates.length && { assetCandidates }) };
    });
  }
}
