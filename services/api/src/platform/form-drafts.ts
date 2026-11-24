import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PlatformAccess, type AccessContext } from './access.js';
import { PlatformDatabase, type QueryExecutor } from './database.js';
import { configText, PlatformForms } from './forms.js';
import { checkEnvironment, previewInputs } from './create-form-agent.js';
import type { ConfigCheck } from './web-check.js';
import { ReleaseBuild } from './release-build.js';

export const digestText = (text: string) =>
  'sha256:' + createHash('sha256').update(text).digest('hex');
export type Delivery = {
  id: string;
  target: 'draft' | 'editor';
  turnId: string;
  draftId: string;
  formId?: string;
  workId?: string;
  candidateText: string;
  candidateBaseText?: string | null;
  digest: string;
  sourceRevision: number;
  baseRevision?: number | null;
  checkId: string;
  checkEnvironment: string;
};
export type Draft = {
  id: string;
  name: string;
  versionName: string;
  text: string;
  candidateText: string;
  candidateBaseText: string | null;
  candidateDigest: string;
  appliedDigest: string;
  revision: number;
  sourceRevision: number;
  previewDigest: string | null;
  formId: string | null;
  versionId: string | null;
  updatedAt: string;
};
type Edit = {
  revision: number;
  name: string;
  versionName: string;
  text: string;
  appliedDigest: string;
};
export type DraftAction = {
  revision: number;
  digest: string;
  workingText?: string;
  profile?: string;
  previewDigest?: string;
  name?: string;
  versionName?: string;
};
export type DraftPreview = {
  prepared: Extract<ConfigCheck, { success: true }>['prepared'];
  digest: string;
};
const columns = `id,name,version_name AS "versionName",working_text AS text,candidate_text AS "candidateText",
 candidate_base_text AS "candidateBaseText",candidate_digest AS "candidateDigest",applied_digest AS "appliedDigest",
 revision,source_revision AS "sourceRevision",preview_digest AS "previewDigest",form_id AS "formId",version_id AS "versionId",updated_at AS "updatedAt"`;
// eslint-disable-next-line no-control-regex -- Control characters have no place in a display name.
const control = /[\u0000-\u001f\u007f]/u;
function name(value: unknown, max: number) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    control.test(value)
  )
    throw new BadRequestException('名称无效');
  return value.trim();
}
function initialName(text: string, id: string) {
  const data = JSON.parse(text);
  const root = Object.values(data.views ?? {})[0] as { props?: { title?: string } } | undefined;
  const value = [data.data?.schema?.title, root?.props?.title, data.title].find(
    (x) => typeof x === 'string' && x.trim(),
  );
  return (value?.trim() || 'Agent 生成的表单 · ' + id.slice(0, 8))
    .split(control)
    .join(' ')
    .slice(0, 120);
}
export function resourceId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    throw new BadRequestException('无效的资源标识');
  return value;
}

@Injectable()
export class PlatformDrafts {
  constructor(
    private readonly storage: PlatformDatabase,
    private readonly access: PlatformAccess,
    private readonly forms: PlatformForms,
    private readonly builds: ReleaseBuild,
  ) {}
  private async find(actor: AccessContext, id: string, db: QueryExecutor) {
    return db.one<Draft>(
      `SELECT ${columns} FROM platform_form_drafts WHERE id=$1 AND user_id=$2 AND space_id=$3`,
      [resourceId(id), actor.userId, actor.spaceId],
    );
  }
  async get(token: string | undefined, id: string, db = this.storage.executor) {
    const actor = await this.access.authenticate(token, 'form:edit', db);
    const row = await this.find(actor, id, db);
    if (!row) throw new NotFoundException();
    return row;
  }
  async list(token: string | undefined) {
    const actor = await this.access.authenticate(token, 'form:edit');
    return this.storage.executor.many(
      'SELECT id,name,version_name AS "versionName",revision,updated_at AS "updatedAt" FROM platform_form_drafts WHERE user_id=$1 AND space_id=$2 AND form_id IS NULL ORDER BY updated_at DESC,id',
      [actor.userId, actor.spaceId],
    );
  }
  async remove(token: string | undefined, id: string) {
    await this.storage.transaction(async (db) => {
      const row = await this.get(token, id, db);
      if (row.formId) throw new ConflictException('已保存的表单不能作为草稿删除');
      await db.execute('DELETE FROM platform_form_drafts WHERE id=$1', [id]);
    });
  }
  async edit(token: string | undefined, id: string, edit: Edit) {
    return this.storage.transaction(async (db) => {
      const row = await this.get(token, id, db);
      if (
        row.formId ||
        row.revision !== edit?.revision ||
        (edit.appliedDigest !== row.appliedDigest && edit.appliedDigest !== row.candidateDigest)
      )
        throw new ConflictException('草稿已更新');
      const text = configText(edit.text);
      await db.execute(
        `UPDATE platform_form_drafts SET name=$2,version_name=$3,working_text=$4,applied_digest=$5,
      revision=revision+1,preview_digest=CASE WHEN working_text=$4 AND applied_digest=$5 THEN preview_digest END,updated_at=now() WHERE id=$1`,
        [id, name(edit.name, 120), name(edit.versionName, 80), text, edit.appliedDigest],
      );
      return this.get(token, id, db);
    });
  }
  async delivered(actor: AccessContext, d: Delivery) {
    const receipt = await this.storage.executor.one(
      'SELECT 1 FROM platform_draft_deliveries WHERE id=$1 AND draft_id=$2 AND user_id=$3 AND space_id=$4',
      [resourceId(d.id), resourceId(d.draftId), actor.userId, actor.spaceId],
    );
    return receipt ? ((await this.find(actor, d.draftId, this.storage.executor)) ?? null) : null;
  }
  async receive(token: string | undefined, owner: AccessContext, d: Delivery) {
    const id = resourceId(d.draftId);
    resourceId(d.id);
    if (
      !Number.isSafeInteger(d.sourceRevision) ||
      d.sourceRevision < 1 ||
      digestText(configText(d.candidateText)) !== d.digest
    )
      throw new BadGatewayException('Invalid candidate delivery');
    const fingerprint = digestText(
      JSON.stringify([
        id,
        d.sourceRevision,
        d.baseRevision ?? null,
        d.candidateBaseText ?? null,
        d.digest,
        d.checkId,
        d.checkEnvironment,
        d.turnId,
      ]),
    );
    return this.storage.transaction(async (db) => {
      const actor = await this.access.authenticate(token, 'form:edit', db);
      if (actor.userId !== owner.userId || actor.spaceId !== owner.spaceId)
        throw new ConflictException('会话所属空间已改变');
      const row = await this.find(actor, id, db);
      const seen = await db.one<{ payload_digest: string; draft_id: string }>(
        'SELECT payload_digest,draft_id FROM platform_draft_deliveries WHERE id=$1 AND user_id=$2 AND space_id=$3',
        [d.id, actor.userId, actor.spaceId],
      );
      if (seen) {
        if (seen.payload_digest !== fingerprint || seen.draft_id !== id)
          throw new ConflictException('候选交付内容已改变');
        return row ?? null;
      }
      const used = await db.one(
        'SELECT 1 FROM platform_draft_deliveries WHERE draft_id=$1 LIMIT 1',
        [id],
      );
      if (!row && used) return null;
      if (!d.checkId) throw new BadGatewayException('Missing check receipt');
      if (d.checkEnvironment !== checkEnvironment(this.builds))
        throw new ConflictException('候选所用编译环境已改变，请重新检查');
      if (row) {
        if (row.formId || d.baseRevision !== row.revision)
          throw new ConflictException('草稿已更新，重新打开草稿后再提出修改');
        const same = row.candidateDigest === d.digest;
        await db.execute(
          `UPDATE platform_form_drafts SET candidate_text=$2,candidate_base_text=$3,candidate_digest=$4,
        source_revision=$5,revision=revision+$6,
        preview_digest=CASE WHEN $6::integer=0 THEN preview_digest END,updated_at=now() WHERE id=$1`,
          [
            id,
            d.candidateText,
            d.candidateBaseText ?? row.text,
            d.digest,
            d.sourceRevision,
            same ? 0 : 1,
          ],
        );
      } else {
        if (d.baseRevision != null) throw new NotFoundException('草稿已删除');
        await db.execute(
          `INSERT INTO platform_form_drafts (id,user_id,space_id,name,version_name,working_text,candidate_text,
         candidate_base_text,candidate_digest,applied_digest,revision,source_revision)
         VALUES($1,$2,$3,$4,'Agent 初稿 V1',$5,$5,$6,$7,$7,1,$8)`,
          [
            id,
            actor.userId,
            actor.spaceId,
            initialName(d.candidateText, id),
            d.candidateText,
            d.candidateBaseText ?? null,
            d.digest,
            d.sourceRevision,
          ],
        );
      }
      await db.execute(
        'INSERT INTO platform_draft_deliveries(id,user_id,space_id,draft_id,payload_digest) VALUES($1,$2,$3,$4,$5)',
        [d.id, actor.userId, actor.spaceId, id, fingerprint],
      );
      return this.find(actor, id, db);
    });
  }
  private text(row: Draft, body: DraftAction) {
    if (
      row.revision !== body?.revision ||
      row.candidateDigest !== body.digest ||
      row.appliedDigest !== row.candidateDigest
    )
      throw new ConflictException('请先对比并应用最新候选');
    return body.workingText === undefined ? row.text : configText(body.workingText);
  }
  async preview(token: string | undefined, id: string, body: DraftAction): Promise<DraftPreview> {
    const row = await this.get(token, id);
    const text = this.text(row, body);
    if (row.formId) throw new ConflictException();
    const result = await this.builds.compile(text, previewInputs(this.builds, body.profile));
    if (!result.success)
      throw new BadRequestException({
        message: '工作稿未通过编译',
        diagnostics: result.diagnostics,
      });
    const digest = digestText(text);
    await this.storage.transaction(async (db) => {
      const current = await this.get(token, id, db);
      if (current.formId) throw new ConflictException();
      this.text(current, body);
      await db.execute('UPDATE platform_form_drafts SET preview_digest=$2 WHERE id=$1', [
        id,
        digest,
      ]);
    });
    return { prepared: result.prepared, digest };
  }
  async save(token: string | undefined, id: string, body: DraftAction) {
    return this.storage.transaction(async (db) => {
      const actor = await this.access.authenticate(token, 'form:edit', db);
      const row = await this.get(token, id, db);
      const text = this.text(row, body);
      if (row.previewDigest !== digestText(text) || body.previewDigest !== row.previewDigest)
        throw new ConflictException('请先预览当前工作稿');
      const title = name(body.name ?? row.name, 120),
        versionName = name(body.versionName ?? row.versionName, 80);
      if (row.formId) {
        if (title !== row.name || versionName !== row.versionName || row.text !== text)
          throw new ConflictException();
        return { formId: row.formId, versionId: row.versionId, workId: row.versionId };
      }
      const saved = await this.forms.saveCreatedCandidate(actor, title, text, db, versionName);
      await db.execute(
        'UPDATE platform_form_drafts SET form_id=$2,version_id=$3,name=$4,version_name=$5,working_text=$6 WHERE id=$1',
        [id, saved.formId, saved.versionId, title, versionName, text],
      );
      return { ...saved, workId: saved.versionId };
    });
  }
}
