import type { QueryExecutor } from './database.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { type AccessContext, PlatformAccess } from './access.js';
import { PlatformDatabase } from './database.js';
import { legacyAssetBindingEvidence } from './asset-binding-evidence.js';
import { ReleaseBuild } from './release-build.js';
import {
  assetChoices,
  loadRevisionBindings,
  reviseAssetBindings,
  type AssetChoice,
  type RevisionBindings,
} from './version-web-bindings.js';
import type { ConfigInput } from './web-check.js';
const initialText = '{}\n';
export const maxConfigTextBytes = 64 * 1024;
const versionIdPattern = /^[0-9a-f-]{36}$/;
type FormRow = {
  form_id: string;
  name: string;
  description: string;
  archived: number;
  metadata_revision: number;
};
type VersionMetadata = {
  version_id: string;
  saved_by: string;
  saved_at: string;
  based_on_version_id: string | null;
  copied_from_version_id: string | null;
  note: string | null;
  version_name: string | null;
};
type VersionRow = VersionMetadata & {
  text: Uint8Array;
  web_asset_bindings: RevisionBindings | null;
};
export function requestIdentity(key: string | undefined, input: unknown[]) {
  if (!key || !/^[a-zA-Z0-9_-]{1,128}$/.test(key)) {
    throw new BadRequestException('A valid Idempotency-Key is required');
  }
  return { key, fingerprint: createHash('sha256').update(JSON.stringify(input)).digest('hex') };
}
export function isUtf8ConfigText(value: unknown): value is string {
  return typeof value === 'string' && Buffer.from(value).toString('utf8') === value;
}

export function configText(value: unknown): string {
  if (!isUtf8ConfigText(value) || Buffer.byteLength(value) > maxConfigTextBytes) {
    throw new BadRequestException(
      `Config must be UTF-8 text of at most ${maxConfigTextBytes / 1024} KiB`,
    );
  }
  return value;
}
function formName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || value.includes('\0'))
    throw new BadRequestException('A form name of 1–120 characters is required');
  return value.trim();
}
@Injectable()
export class PlatformForms {
  constructor(
    private readonly storage: PlatformDatabase,
    private readonly access: PlatformAccess,
    private readonly builds: ReleaseBuild,
  ) {}
  async list(token: string | undefined, db: QueryExecutor = this.storage.executor) {
    const { spaceId } = await this.access.authenticate(token, 'form:view', db);
    const rows = (await db.many(
      `
      SELECT f.*,
        v.version_id AS saved_version_id, v.saved_at,
        r.release_id, r.release_name, r.version_id AS published_version_id, a.recorded_at AS published_at
      FROM platform_forms f
      LEFT JOIN platform_versions v ON v.sequence = (
        SELECT sequence FROM platform_versions WHERE form_id = f.form_id ORDER BY sequence DESC LIMIT 1
      )
      LEFT JOIN platform_releases r ON r.release_sequence = (
        SELECT release_sequence FROM platform_releases WHERE form_id = f.form_id ORDER BY release_sequence DESC LIMIT 1
      )
      LEFT JOIN platform_release_audit a ON a.release_id = r.release_id
      WHERE f.space_id = $1 ORDER BY f.name, f.form_id
    `,
      [spaceId],
    )) as (FormRow & {
      saved_version_id: string | null;
      saved_at: string | null;
      release_id: string | null;
      release_name: string | null;
      published_version_id: string | null;
      published_at: string | null;
    })[];
    return rows.map((row) => ({
      ...this.formSummary(row),
      latestSave:
        row.saved_version_id && row.saved_at
          ? { versionId: row.saved_version_id, savedAt: row.saved_at }
          : null,
      latestRelease:
        row.release_id && row.published_version_id && row.published_at
          ? {
              releaseId: row.release_id,
              ...(row.release_name && { name: row.release_name }),
              versionId: row.published_version_id,
              publishedAt: row.published_at,
            }
          : null,
    }));
  }
  async open(token: string | undefined, formId: string, db: QueryExecutor = this.storage.executor) {
    const context = await this.access.authenticate(token, 'form:view', db);
    const form = await this.findForm(context.spaceId, formId, db);
    const row = (await db.one(
      'SELECT * FROM platform_versions WHERE form_id = $1 ORDER BY sequence DESC LIMIT 1',
      [formId],
    )) as VersionRow | undefined;
    return {
      ...this.formSummary(form),
      version: row ? this.version(row) : null,
      text: row ? Buffer.from(row.text).toString('utf8') : initialText,
    };
  }
  async readVersion(
    spaceId: string,
    formId: string,
    versionId: string,
    db: QueryExecutor = this.storage.executor,
  ) {
    await this.findForm(spaceId, formId, db);
    const row = (await db.one(
      'SELECT * FROM platform_versions WHERE form_id = $1 AND version_id = $2',
      [formId, versionId],
    )) as VersionRow | undefined;
    if (!row) throw new NotFoundException();
    return this.version(row);
  }
  async create(token: string | undefined, key: string | undefined, name: unknown) {
    return await this.storage.transaction(async (db) => {
      const context = await this.access.authenticate(token, 'form:edit', db);
      const normalizedName = formName(name);
      const formId = await this.writeOnce(
        context,
        'create-form',
        key,
        [name],
        async () => await this.insertForm(context, normalizedName, db),
        db,
      );
      return { formId };
    });
  }
  async save(
    token: string | undefined,
    key: string | undefined,
    formId: string,
    text: unknown,
    source: unknown,
    note?: unknown,
    name?: unknown,
    workId?: string,
    choicesInput?: unknown,
    inspectedCatalog?: unknown,
  ) {
    const choices = assetChoices(choicesInput);
    if (
      inspectedCatalog !== undefined &&
      (typeof inspectedCatalog !== 'string' || inspectedCatalog.length > 200)
    )
      throw new BadRequestException('Invalid inspected Web catalog');
    return await this.storage.transaction(async (db) => {
      const context = await this.access.authenticate(token, 'form:edit', db);
      const form = await this.findForm(context.spaceId, formId, db);
      const original = configText(text);
      if (
        source !== undefined &&
        source !== null &&
        (typeof source !== 'string' || !versionIdPattern.test(source))
      ) {
        throw new BadRequestException('Invalid source version');
      }
      const basedOn = source ?? null;
      if (note != null && (typeof note !== 'string' || note.length > 300 || note.includes('\0'))) {
        throw new BadRequestException('Version note must be at most 300 characters');
      }
      const savedNote = note ?? null;
      if (
        name !== undefined &&
        (typeof name !== 'string' ||
          name.trim().length > 80 ||
          Array.from(name).some(
            (char) =>
              char.charCodeAt(0) < 32 || [127, 133, 8232, 8233].includes(char.charCodeAt(0)),
          ))
      )
        throw new BadRequestException('Invalid version name');
      const savedName = typeof name === 'string' ? name.trim() || null : null;
      const versionId = await this.writeOnce(
        context,
        'save-version',
        key,
        [
          formId,
          text,
          basedOn,
          ...(workId ? [{ workId }] : []),
          ...(choices.length ? [{ assetChoices: choices }] : []),
          ...(inspectedCatalog === undefined ? [] : [{ inspectedCatalog }]),
          ...(savedNote === null ? [] : [savedNote]),
          ...(savedName === null ? [] : [{ name: savedName }]),
        ],
        async () => {
          if (form.archived) throw new ConflictException('Form is archived');
          if (
            inspectedCatalog !== undefined &&
            inspectedCatalog !== this.builds.assets.recommended.id
          )
            throw new ConflictException('推荐资产已更新，请重新检查或预览后保存。');
          if (
            basedOn &&
            !(await db.one(
              'SELECT 1 FROM platform_versions WHERE form_id = $1 AND version_id = $2',
              [formId, basedOn],
            ))
          )
            throw new BadRequestException('Source version is outside this form');
          let parent = basedOn;
          if (workId) {
            const work = await this.workRow(formId, workId, db);
            if (work.published || work.head !== basedOn)
              throw new ConflictException('Version was published or changed');
            parent = basedOn ?? work.source;
          }
          return await this.insertVersion(
            context,
            formId,
            original,
            parent,
            null,
            savedNote,
            savedName,
            db,
            workId,
            choices,
          );
        },
        db,
      );
      return { versionId };
    });
  }
  async applyDiagnosticRepair(
    token: string | undefined,
    key: string | undefined,
    input: {
      formId: string;
      workId: string;
      expectedHead: string | null;
      diagnosticId: string;
      releaseId: string;
      versionId: string;
      candidateDigest: string;
    },
    verify: () => Promise<{ text: string; originalText: string }>,
  ) {
    const authorize = async (db: QueryExecutor) => {
      const actor = await this.access.authenticate(token, 'form:edit', db);
      if (!actor.permissions.includes('diagnostic:view')) throw new ForbiddenException();
      return actor;
    };
    const { formId, workId, expectedHead } = input;
    const request = [input];
    const operation = 'apply-diagnostic-repair';
    const id = requestIdentity(key, request);
    const actor = await authorize(this.storage.executor);
    await this.findForm(actor.spaceId, formId, this.storage.executor);
    const saved = await this.readReceipt(actor, operation, id, this.storage.executor);
    if (saved) return { versionId: saved };
    // Recompile and replay outside the transaction-wide Platform write lock.
    const candidate = await verify();
    return this.storage.transaction(async (db) => {
      const writer = await authorize(db);
      const form = await this.findForm(writer.spaceId, formId, db);
      const versionId = await this.writeOnce(
        writer,
        operation,
        key,
        request,
        async () => {
          if (form.archived) throw new ConflictException('表单已归档。');
          const work = await this.workRow(formId, workId, db);
          if (work.published || work.head !== expectedHead)
            throw new ConflictException('工作版本已更新或发布，请重新选择。');
          const current = work.head
            ? (await this.readVersion(writer.spaceId, formId, work.head, db)).text
            : Buffer.from(
                (await db.one<{ seed: Buffer }>(
                  'SELECT seed FROM platform_working_versions WHERE form_id=$1 AND work_id=$2',
                  [formId, workId],
                ))!.seed,
              ).toString('utf8');
          if (current !== candidate.originalText)
            throw new ConflictException('工作版本的配置与候选基线不同。');
          return this.insertVersion(
            writer,
            formId,
            configText(candidate.text),
            work.head ?? work.source,
            null,
            '应用表单错误 ' + input.diagnosticId + ' 的修复候选',
            null,
            db,
            workId,
          );
        },
        db,
      );
      return { versionId };
    });
  }

  private workQuery = `SELECT w.work_id AS id,w.name,w.source_version_id AS source,head.version_id AS head,coalesce(head.saved_at,w.created_at) AS updated,
    EXISTS(SELECT 1 FROM platform_releases r JOIN platform_versions v ON v.version_id=r.version_id WHERE v.work_id=w.work_id) AS published
    FROM platform_working_versions w LEFT JOIN LATERAL (SELECT version_id,saved_at FROM platform_versions WHERE work_id=w.work_id ORDER BY sequence DESC LIMIT 1) head ON true WHERE w.form_id=$1`;
  private async workRow(formId: string, id: string, db: QueryExecutor) {
    const row = await db.one<{
      id: string;
      name: string;
      source: string | null;
      published: boolean;
      head: string | null;
      updated: string;
    }>(this.workQuery + ' AND w.work_id=$2', [formId, id]);
    if (!row) throw new NotFoundException();
    return row;
  }
  async works(token: string | undefined, formId: string, id?: string) {
    const db = this.storage.executor;
    const { spaceId } = await this.access.authenticate(token, 'form:view', db);
    await this.findForm(spaceId, formId, db);
    if (!id) return db.many(this.workQuery + ' ORDER BY updated DESC,w.work_id', [formId]);
    const work = await this.workRow(formId, id, db);
    const history = await db.many<VersionMetadata>(
      'SELECT version_id,saved_at,saved_by,note,version_name,based_on_version_id,copied_from_version_id FROM platform_versions WHERE form_id=$1 AND work_id=$2 ORDER BY sequence DESC',
      [formId, id],
    );
    const version = work.head
      ? await this.readVersion(spaceId, formId, work.head as string, db)
      : null;
    const seed = version
      ? null
      : await db.one<{ seed: Buffer }>(
          'SELECT seed FROM platform_working_versions WHERE work_id=$1',
          [id],
        );
    return {
      ...work,
      history: history.map((v) => this.versionMetadata(v)),
      version,
      text: version?.text ?? Buffer.from(seed!.seed).toString('utf8'),
    };
  }
  async newWork(
    token: string | undefined,
    key: string | undefined,
    formId: string,
    input: { name?: unknown; source?: unknown; text?: unknown },
  ) {
    return this.storage.transaction(async (db) => {
      const actor = await this.access.authenticate(token, 'form:edit', db);
      const form = await this.findForm(actor.spaceId, formId, db);
      const name = formName(input?.name);
      const id = await this.writeOnce(
        actor,
        'create-working-version',
        key,
        [formId, name, input.source ?? null, input.text ?? null],
        async () => {
          if (form.archived) throw new ConflictException('Form is archived');
          const seed =
            typeof input.source === 'string'
              ? (await this.readVersion(actor.spaceId, formId, input.source, db)).text
              : configText(input.text ?? initialText);
          const id = randomUUID();
          await db.execute(
            'INSERT INTO platform_working_versions(work_id,form_id,name,seed,source_version_id,created_at) VALUES($1,$2,$3,$4,$5,$6)',
            [id, formId, name, Buffer.from(seed), input.source ?? null, new Date().toISOString()],
          );
          return id;
        },
        db,
      );
      return { id };
    });
  }
  async checkPublishHead(formId: string, versionId: string, db: QueryExecutor) {
    const row = await db.one<{ work_id: string }>(
      'SELECT work_id FROM platform_versions WHERE form_id=$1 AND version_id=$2',
      [formId, versionId],
    );
    if (!row) throw new NotFoundException();
    if ((await this.workRow(formId, row.work_id, db)).head !== versionId)
      throw new ConflictException('Working version has a newer snapshot');
  }
  async history(
    token: string | undefined,
    formId: string,
    db: QueryExecutor = this.storage.executor,
  ) {
    const { spaceId } = await this.access.authenticate(token, 'form:view', db);
    await this.findForm(spaceId, formId, db);
    const rows = (await db.many(
      `SELECT version_id, saved_by, saved_at, based_on_version_id, copied_from_version_id, note, version_name
         FROM platform_versions WHERE form_id = $1 ORDER BY sequence DESC`,
      [formId],
    )) as VersionMetadata[];
    return rows.map((row) => this.versionMetadata(row));
  }
  async detail(
    token: string | undefined,
    formId: string,
    versionId: string,
    db: QueryExecutor = this.storage.executor,
  ) {
    const { spaceId } = await this.access.authenticate(token, 'form:view', db);
    return await this.readVersion(spaceId, formId, versionId, db);
  }
  async assetBindingEvidence(
    token: string | undefined,
    formId: string,
    versionId: string,
    db: QueryExecutor = this.storage.executor,
  ) {
    await this.detail(token, formId, versionId, db);
    return legacyAssetBindingEvidence(db, formId, versionId);
  }
  async revisionAssetBindings(
    db: QueryExecutor,
    formId: string,
    version: Awaited<ReturnType<PlatformForms['readVersion']>>,
  ) {
    return loadRevisionBindings(
      db,
      this.builds.assets,
      formId,
      version.versionId,
      version.text,
      version.assetBindings,
    );
  }

  async authoringAssetInput(
    token: string | undefined,
    formId: string,
    input: ConfigInput,
    operation: 'check' | 'preview',
    db: QueryExecutor = this.storage.executor,
  ) {
    const text = await this.authoringInput(token, formId, input, operation, db);
    const choices = assetChoices(input.assetChoices);
    const source = input.versionId ?? input.basedOnVersionId;
    if (source == null)
      return { text, bindings: reviseAssetBindings(this.builds.assets, text, [], choices) };
    if (
      typeof source !== 'string' ||
      (input.versionId !== undefined && (choices.length || input.basedOnVersionId !== undefined))
    )
      throw new BadRequestException('Invalid Web asset revision');
    const actor = await this.access.authenticate(
      token,
      input.versionId !== undefined && operation === 'preview' ? 'form:view' : 'form:edit',
      db,
    );
    const revision = await this.readVersion(actor.spaceId, formId, source, db);
    const inherited = await this.revisionAssetBindings(db, formId, revision);
    return {
      text,
      bindings:
        input.versionId !== undefined
          ? inherited
          : reviseAssetBindings(this.builds.assets, text, inherited, choices),
    };
  }

  async authoringInput(
    token: string | undefined,
    formId: string,
    input: {
      versionId?: unknown;
      text?: unknown;
    },
    operation: 'check' | 'preview',
    db: QueryExecutor = this.storage.executor,
  ) {
    const saved = input.versionId !== undefined;
    const context = await this.access.authenticate(
      token,
      saved && operation === 'preview' ? 'form:view' : 'form:edit',
      db,
    );
    if (saved) {
      if (typeof input.versionId !== 'string' || input.text !== undefined)
        throw new BadRequestException('Specify exactly one config input');
      return (await this.readVersion(context.spaceId, formId, input.versionId, db)).text;
    }
    const form = await this.findForm(context.spaceId, formId, db);
    if (form.archived) throw new ConflictException('Form is archived');
    return configText(input.text);
  }
  async copy(
    token: string | undefined,
    key: string | undefined,
    sourceFormId: string,
    input: {
      name?: unknown;
      versionId?: unknown;
      text?: unknown;
      basedOnVersionId?: unknown;
    },
  ) {
    return await this.storage.transaction(async (db) => {
      const context = await this.access.authenticate(token, 'form:edit', db);
      if (!context.permissions.includes('form:view')) throw new ForbiddenException();
      const sourceForm = await this.findForm(context.spaceId, sourceFormId, db);
      const name = formName(input.name);
      const selected = input.versionId !== undefined;
      if (
        selected &&
        (typeof input.versionId !== 'string' ||
          input.text !== undefined ||
          input.basedOnVersionId !== undefined)
      ) {
        throw new BadRequestException('Specify exactly one config input');
      }
      const sourceId = selected ? input.versionId : (input.basedOnVersionId ?? null);
      if (sourceId !== null && typeof sourceId !== 'string')
        throw new BadRequestException('Invalid source version');
      const source =
        sourceId === null
          ? null
          : await this.readVersion(context.spaceId, sourceFormId, sourceId, db);
      const original = selected && source ? source.text : configText(input.text);
      const formId = await this.writeOnce(
        context,
        'copy-form',
        key,
        [sourceFormId, input.name, selected, sourceId, original],
        async () => {
          if (!selected && sourceForm.archived) throw new ConflictException('Form is archived');
          const id = await this.insertForm(context, name, db);
          await this.insertVersion(
            context,
            id,
            original,
            null,
            sourceId,
            undefined,
            undefined,
            db,
            undefined,
            [],
            sourceFormId,
          );
          return id;
        },
        db,
      );
      const initial = await db.one(
        'SELECT version_id FROM platform_versions WHERE form_id = $1 ORDER BY sequence LIMIT 1',
        [formId],
      );
      return { formId, versionId: String(initial!.version_id) };
    });
  }
  async updateMetadata(
    token: string | undefined,
    formId: string,
    input: {
      name?: unknown;
      description?: unknown;
      revision?: unknown;
    },
  ) {
    return await this.storage.transaction(async (db) => {
      const { spaceId } = await this.access.authenticate(token, 'form:edit', db);
      const form = await this.findForm(spaceId, formId, db);
      if (form.archived) throw new ConflictException('Form is archived');
      const name = formName(input.name);
      const { description, revision } = input;
      if (
        typeof description !== 'string' ||
        description.length > 2000 ||
        description.includes('\0') ||
        typeof revision !== 'number' ||
        !Number.isSafeInteger(revision) ||
        revision < 0
      )
        throw new BadRequestException('Invalid form metadata');
      const result = await db.execute(
        `UPDATE platform_forms SET name = $1, description = $2, metadata_revision = metadata_revision + 1
           WHERE space_id = $3 AND form_id = $4 AND metadata_revision = $5`,
        [name, description, spaceId, formId, revision],
      );
      if (!result.rowCount) throw new ConflictException('Form metadata changed');
      return this.formSummary(await this.findForm(spaceId, formId, db));
    });
  }
  async setArchived(token: string | undefined, formId: string, archived: boolean) {
    return await this.storage.transaction(async (db) => {
      const { spaceId, userId } = await this.access.authenticate(token, 'form:manage', db);
      const form = await this.findForm(spaceId, formId, db);
      if (form.archived !== Number(archived)) {
        await db.execute('UPDATE platform_forms SET archived = $1 WHERE form_id = $2', [
          Number(archived),
          formId,
        ]);
        await db.execute(
          `INSERT INTO platform_form_audit (form_id, actor_id, action, recorded_at)
           VALUES ($1, $2, $3, $4)`,
          [formId, userId, archived ? 'archive' : 'restore', new Date().toISOString()],
        );
      }
      return this.formSummary({ ...form, archived: Number(archived) });
    });
  }
  private async insertForm(
    context: AccessContext,
    name: string,
    db: QueryExecutor = this.storage.executor,
  ) {
    const id = randomUUID();
    await db.execute(
      `INSERT INTO platform_forms (form_id, space_id, name, created_by, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
      [id, context.spaceId, name, context.userId, new Date().toISOString()],
    );
    return id;
  }
  async saveCreatedCandidate(
    context: AccessContext,
    name: unknown,
    text: string,
    db: QueryExecutor,
    versionName = '初始版本',
    pinned?: RevisionBindings,
  ) {
    const formId = await this.insertForm(context, formName(name), db);
    const versionId = await this.insertVersion(
      context,
      formId,
      configText(text),
      null,
      null,
      null,
      versionName,
      db,
      undefined,
      [],
      formId,
      pinned,
    );
    return { formId, versionId };
  }

  private async insertVersion(
    context: AccessContext,
    formId: string,
    text: string,
    basedOn: string | null,
    copiedFrom: string | null = null,
    note: string | null = null,
    name: string | null = null,
    db: QueryExecutor = this.storage.executor,
    workId?: string,
    choices: readonly AssetChoice[] = [],
    sourceFormId = formId,
    pinned?: RevisionBindings,
  ) {
    const id = randomUUID();
    const sourceId = basedOn ?? copiedFrom;
    const inherited = sourceId
      ? await this.revisionAssetBindings(
          db,
          sourceFormId,
          await this.readVersion(context.spaceId, sourceFormId, sourceId, db),
        )
      : [];
    const bindings = pinned ?? reviseAssetBindings(this.builds.assets, text, inherited, choices);
    await db.execute(
      `INSERT INTO platform_versions
          (version_id, form_id, text, saved_by, saved_at, based_on_version_id, copied_from_version_id, note, version_name,work_id,web_asset_bindings)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,$10,$11)`,
      [
        id,
        formId,
        Buffer.from(text),
        context.userId,
        new Date().toISOString(),
        basedOn,
        copiedFrom,
        note,
        name,
        workId ?? null,
        JSON.stringify(bindings),
      ],
    );
    return id;
  }
  async findForm(spaceId: string, formId: string, db: QueryExecutor = this.storage.executor) {
    const row = (await db.one(
      'SELECT form_id, name, description, archived, metadata_revision FROM platform_forms WHERE space_id = $1 AND form_id = $2',
      [spaceId, formId],
    )) as FormRow | undefined;
    if (!row) throw new NotFoundException();
    return row;
  }
  private formSummary(row: FormRow) {
    return {
      formId: row.form_id,
      name: row.name,
      description: row.description,
      archived: row.archived === 1,
      revision: row.metadata_revision,
    };
  }
  private version(row: VersionRow) {
    return {
      ...this.versionMetadata(row),
      text: Buffer.from(row.text).toString('utf8'),
      assetBindings: row.web_asset_bindings ?? null,
    };
  }
  private versionMetadata(row: VersionMetadata) {
    return {
      versionId: row.version_id,
      savedBy: row.saved_by,
      savedAt: row.saved_at,
      basedOnVersionId: row.based_on_version_id ?? row.copied_from_version_id,
      note: row.note,
      name: row.version_name,
    };
  }
  private async writeOnce(
    context: AccessContext,
    operation: string,
    key: string | undefined,
    input: unknown[],
    write: () => Promise<string>,
    db: QueryExecutor = this.storage.executor,
  ) {
    const request = requestIdentity(key, input);
    const saved = await this.readReceipt(context, operation, request, db);
    if (saved) return saved;
    const identity = [context.spaceId, context.userId, operation, request.key];
    const result = await write();
    await db.execute(
      `
      INSERT INTO platform_receipts (space_id, user_id, operation, request_key, fingerprint, result_id)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
      [...identity, request.fingerprint, result],
    );
    return result;
  }
  private async readReceipt(
    context: AccessContext,
    operation: string,
    request: ReturnType<typeof requestIdentity>,
    db: QueryExecutor,
  ) {
    const { fingerprint } = request;
    const identity = [context.spaceId, context.userId, operation, request.key] as const;
    const existing = await db.one(
      `
      SELECT fingerprint, result_id FROM platform_receipts
      WHERE space_id = $1 AND user_id = $2 AND operation = $3 AND request_key = $4
    `,
      [...identity],
    );
    if (existing) {
      if (existing.fingerprint !== fingerprint)
        throw new ConflictException('Request key already used');
      return String(existing.result_id);
    }
  }
}
