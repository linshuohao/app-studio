import type { QueryExecutor } from './database.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { PlatformAccess } from './access.js';
import { PlatformDatabase } from './database.js';
import { PlatformForms, requestIdentity } from './forms.js';
import { ReleaseBuild, type ReleaseBuildInput } from './release-build.js';
import { type LocatedDiagnostic, webTarget } from './web-check.js';
import { captureAssetBindings, deployedAsset } from './version-web-bindings.js';
type PublishInput = {
  versionId?: unknown;
  profile?: unknown;
  name?: unknown;
  text?: unknown;
};
type AcceptedRequest = {
  request_id: string;
  user_id: string;
  member_id: string;
  space_id: string;
  form_id: string;
  version_id: string;
  fingerprint: string;
  build_input: string;
  release_name: string | null;
};
type ReleaseRow = {
  release_id: string;
  release_name: string | null;
  version_id: string;
  target: string;
  diagnostics: string;
  prepared_text: string;
  digest: string;
};
function targetOf(row: Pick<ReleaseRow, 'target'>) {
  return JSON.parse(row.target) as {
    platform: string;
    profile: string;
  };
}
function receipt(row: Omit<ReleaseRow, 'prepared_text' | 'digest'>) {
  return {
    success: true as const,
    releaseId: row.release_id,
    ...(row.release_name && { name: row.release_name }),
    versionId: row.version_id,
    target: targetOf(row),
    diagnostics: JSON.parse(row.diagnostics) as LocatedDiagnostic[],
  };
}
@Injectable()
export class PlatformReleases {
  constructor(
    private readonly storage: PlatformDatabase,
    private readonly access: PlatformAccess,
    private readonly forms: PlatformForms,
    private readonly builder: ReleaseBuild,
  ) {}
  async publish(
    token: string | undefined,
    formId: string,
    key: string | undefined,
    input: PublishInput,
  ) {
    const versionId = input.versionId;
    if (typeof versionId !== 'string' || input.text !== undefined)
      throw new BadRequestException('Specify one saved version');
    if (
      input.name !== undefined &&
      (typeof input.name !== 'string' ||
        input.name.trim().length > 80 ||
        Array.from(input.name).some(
          (char) => char.charCodeAt(0) < 32 || [127, 133, 8232, 8233].includes(char.charCodeAt(0)),
        ))
    )
      throw new BadRequestException('Release name must be a single line up to 80 characters');
    const name = typeof input.name === 'string' ? input.name.trim() || null : null;
    const target = webTarget(input.profile);
    const { key: requestKey, fingerprint } = requestIdentity(
      key,
      name ? [formId, versionId, target, name] : [formId, versionId, target],
    );
    const accepted = await this.storage.transaction(async (db) => {
      const actor = await this.access.authenticate(token, 'form:view', db);
      const form = await this.forms.findForm(actor.spaceId, formId, db);
      const previous = (await db.one(
        'SELECT * FROM platform_release_requests WHERE space_id = $1 AND user_id = $2 AND request_key = $3',
        [actor.spaceId, actor.userId, requestKey],
      )) as AcceptedRequest | undefined;
      if (previous && previous.fingerprint !== fingerprint)
        throw new ConflictException('Request key already used');
      const complete = previous && (await this.byRequest(previous.request_id, db));
      if (complete) return { result: receipt(complete) };
      if (!actor.permissions.includes('form:publish')) throw new ForbiddenException();
      if (form.archived) throw new ConflictException('Form is archived');
      const revision = await this.forms.readVersion(actor.spaceId, formId, versionId, db);
      const { text } = revision;
      await this.forms.checkPublishHead(formId, versionId, db);
      if (previous) return { request: previous, text };
      const bindings = await this.forms.revisionAssetBindings(db, formId, revision);
      const { catalog, selections } = captureAssetBindings(
        this.builder.assets,
        text,
        target.profile,
        bindings,
      );
      const pending: AcceptedRequest = {
        request_id: randomUUID(),
        space_id: actor.spaceId,
        user_id: actor.userId,
        member_id: actor.memberId,
        form_id: formId,
        version_id: versionId,
        fingerprint,
        build_input: JSON.stringify(this.builder.capture(target, catalog, selections)),
        release_name: name,
      };
      await db.execute(
        `
        INSERT INTO platform_release_requests
        (request_id, space_id, user_id, member_id, request_key, fingerprint, form_id, version_id, build_input, release_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `,
        [
          pending.request_id,
          actor.spaceId,
          actor.userId,
          actor.memberId,
          requestKey,
          fingerprint,
          formId,
          versionId,
          pending.build_input,
          pending.release_name,
        ],
      );
      return { request: pending, text };
    });
    if ('result' in accepted) return accepted.result;
    const pending = accepted.request;
    const inputSnapshot = JSON.parse(pending.build_input) as ReleaseBuildInput;
    const checked = await this.builder.compile(accepted.text, inputSnapshot);
    if (!checked.success)
      return { success: false as const, versionId, diagnostics: checked.diagnostics };
    const unavailable = (['materials', 'pureFunctions'] as const).flatMap((kind) =>
      Object.entries(checked.prepared.capabilityLock[kind]).flatMap(([id, lock]) =>
        deployedAsset(this.builder.assets, kind, id, lock)
          ? []
          : [
              {
                code: 'ASSET_ARTIFACT_UNAVAILABLE',
                severity: 'error' as const,
                sourcePointer: '',
                message: `发布目标缺少锁定制品：${id} @ ${lock.version}（${lock.artifact.digest}）`,
              },
            ],
      ),
    );
    if (unavailable.length) return { success: false as const, versionId, diagnostics: unavailable };
    // Capture documentation on schema nodes before hashing, keeping historical deliveries self-contained.
    const prepared = structuredClone(checked.prepared);
    for (const [prefix, notes] of Object.entries(inputSnapshot.requestNotes ?? {})) {
      for (const [pointer, description] of Object.entries(notes)) {
        const [side, ...segments] = pointer.split('/');
        if (side !== 'payloadSchema' && side !== 'resultSchema') continue;
        const key = prefix + (side === 'payloadSchema' ? ':payload' : ':result');
        let node: unknown = prepared.resources.requestSchemas[key];
        for (const segment of segments) {
          const part = segment.replaceAll('~1', '/').replaceAll('~0', '~');
          if (!node || typeof node !== 'object' || !Object.hasOwn(node, part)) {
            node = undefined;
            break;
          }
          node = (node as Record<string, unknown>)[part];
        }
        if (node && typeof node === 'object' && !Array.isArray(node))
          Object.assign(node, { description });
      }
    }
    const preparedText = JSON.stringify(prepared);
    const digest = `sha256:${createHash('sha256').update(preparedText, 'utf8').digest('hex')}`;
    const result: ReleaseRow = {
      release_id: randomUUID(),
      release_name: pending.release_name,
      version_id: versionId,
      target: JSON.stringify(checked.target),
      prepared_text: preparedText,
      digest,
      diagnostics: JSON.stringify(checked.diagnostics),
    };
    return await this.storage.transaction(async (db) => {
      const actor = await this.access.contextForUser(pending.user_id, db);
      if (actor.memberId !== pending.member_id || actor.spaceId !== pending.space_id)
        throw new ForbiddenException();
      const existing = await this.byRequest(pending.request_id, db);
      if (existing && actor.permissions.includes('form:view')) return receipt(existing);
      if (!actor.permissions.includes('form:publish')) throw new ForbiddenException();
      if ((await this.forms.findForm(actor.spaceId, pending.form_id, db)).archived)
        throw new ConflictException('Form is archived');
      await this.forms.checkPublishHead(formId, versionId, db);
      await db.execute(
        `
        INSERT INTO platform_releases
        (release_id, request_id, form_id, version_id, target, prepared_text, digest, diagnostics, release_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `,
        [
          result.release_id,
          pending.request_id,
          formId,
          versionId,
          result.target,
          preparedText,
          digest,
          result.diagnostics,
          result.release_name,
        ],
      );
      await db.execute('INSERT INTO platform_release_audit VALUES ($1, $2, $3)', [
        result.release_id,
        actor.userId,
        new Date().toISOString(),
      ]);
      return receipt(result);
    });
  }
  async list(token: string | undefined, formId: string, db: QueryExecutor = this.storage.executor) {
    const actor = await this.access.authenticate(token, 'form:view', db);
    await this.forms.findForm(actor.spaceId, formId, db);
    const rows = (await db.many(
      `
      SELECT r.release_id, r.release_name, r.version_id, r.target, r.diagnostics, a.actor_id, a.recorded_at
      FROM platform_releases r
      LEFT JOIN platform_release_audit a ON a.release_id = r.release_id
      WHERE r.form_id = $1 ORDER BY r.release_sequence DESC
    `,
      [formId],
    )) as (Pick<
      ReleaseRow,
      'release_id' | 'release_name' | 'version_id' | 'target' | 'diagnostics'
    > & {
      actor_id: string | null;
      recorded_at: string | null;
    })[];
    return rows.map((row) => ({
      ...receipt(row),
      publishedBy: row.actor_id,
      publishedAt: row.recorded_at,
    }));
  }
  async delivery(releaseId: string, db: QueryExecutor = this.storage.executor) {
    const row = (await db.one(
      'SELECT release_id, release_name, target, prepared_text, digest FROM platform_releases WHERE release_id = $1',
      [releaseId],
    )) as ReleaseRow | undefined;
    if (!row) throw new NotFoundException();
    return {
      format: 'form-engine.release/1',
      releaseId: row.release_id,
      ...(row.release_name && { name: row.release_name }),
      target: targetOf(row),
      preparedText: row.prepared_text,
      digest: row.digest,
    };
  }
  private async byRequest(requestId: string, db: QueryExecutor = this.storage.executor) {
    return (await db.one('SELECT * FROM platform_releases WHERE request_id = $1', [requestId])) as
      ReleaseRow | undefined;
  }
}
