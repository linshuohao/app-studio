import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { githubPullRequestNumber, withGitHubPullRequestStatus } from './asset-repair-github.js';
import { PlatformAccess } from './access.js';
import { PlatformDatabase, type QueryExecutor } from './database.js';
import { readDiagnosticAssets, type DiagnosticAsset } from './diagnostic-assets.js';
import { readDiagnosticReference } from './diagnostic-reference.js';
import { resourceId } from './form-drafts.js';
import { requestIdentity } from './forms.js';
import { requireStudioOrigin, session } from './session-http.js';

type Status = 'open' | 'in_progress' | 'in_review' | 'changes_requested' | 'approved';
type PullRequest = { url: string; headSha: string; version: string };
type Task = {
  id: string;
  releaseId: string;
  formId: string;
  formName: string;
  versionId: string;
  kind: DiagnosticAsset['kind'];
  asset: DiagnosticAsset['lock'];
  assignee: string | null;
  status: Status;
  revision: number;
  pullRequest: PullRequest | null;
  reviewer: string | null;
  updatedAt: Date;
};
type Receipt = Pick<Task, 'id' | 'revision' | 'status'>;
type Action = {
  action?: unknown;
  revision?: unknown;
  note?: unknown;
  pullRequest?: { url?: unknown; headSha?: unknown; version?: unknown };
};

const taskQuery = `SELECT t.id,t.release_id AS "releaseId",f.form_id AS "formId",
  f.name AS "formName",r.version_id AS "versionId",t.asset_kind AS kind,t.asset_lock AS asset,
  t.assignee,t.status,t.revision,t.pull_request AS "pullRequest",t.reviewer,t.updated_at AS "updatedAt"
  FROM platform_asset_repair_tasks t JOIN platform_releases r USING(release_id)
  JOIN platform_forms f USING(form_id) WHERE t.space_id=$1`;

function semver(value: unknown) {
  if (
    typeof value !== 'string' ||
    !/^(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})$/.test(value)
  )
    return undefined;
  return value.split('.').map(Number);
}

function configuredRepository() {
  const repo = process.env.PLATFORM_ASSET_REPAIR_REPOSITORY;
  return repo && /^[\w.-]+\/[\w.-]+$/.test(repo) ? repo : null;
}

function pullRequest(input: Action['pullRequest'], originalVersion: string): PullRequest {
  const repo = configuredRepository();
  if (!repo) throw new ConflictException('资产代码仓库尚未配置。');
  const { url, headSha, version } = input ?? {};
  if (
    typeof url !== 'string' ||
    githubPullRequestNumber(url, repo) === undefined ||
    typeof headSha !== 'string' ||
    !/^[a-f0-9]{40}$/.test(headSha)
  )
    throw new BadRequestException('请提供资产仓库的 GitHub PR 地址及 40 位提交 SHA。');
  const before = semver(originalVersion);
  const after = semver(version);
  const different = after?.findIndex((part, i) => part !== before?.[i]) ?? -1;
  if (!before || !after || different < 0 || after[different]! <= before[different]!)
    throw new BadRequestException('拟发布版本必须是高于原资产版本的三段版本号。');
  return { url, headSha, version: version as string };
}

@Controller('api/platform')
export class AssetRepairsController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly db: PlatformDatabase,
  ) {}

  private async task(db: QueryExecutor, spaceId: string, id: string) {
    const row = await db.one<Task>(taskQuery + ' AND t.id=$2', [spaceId, resourceId(id)]);
    if (!row) throw new NotFoundException('资产修复任务不存在。');
    return row;
  }

  @Header('Cache-Control', 'no-store')
  @Get('diagnostics/events/:id/asset-repairs')
  async candidates(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    const actor = await this.access.authenticate(session(cookie), 'diagnostic:view');
    const ref = await readDiagnosticReference(this.db.executor, actor.spaceId, id);
    return readDiagnosticAssets(this.db.executor, ref);
  }

  @Header('Cache-Control', 'no-store')
  @Post('diagnostics/events/:id/asset-repairs')
  async create(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Param('id') id: string,
    @Body() body: { kind?: unknown; assetId?: unknown },
  ) {
    requireStudioOrigin(origin);
    return this.db.transaction(async (tx) => {
      const actor = await this.access.authenticate(session(cookie), 'diagnostic:view', tx);
      const ref = await readDiagnosticReference(tx, actor.spaceId, id);
      const selected = (await readDiagnosticAssets(tx, ref)).find(
        ({ kind, lock }) => kind === body?.kind && lock.id === body?.assetId,
      );
      if (!selected) throw new BadRequestException('请选择原发布锁定且与失败位置关联的资产。');
      const { kind, lock } = selected;
      const event = await tx.one<{ fingerprint: string }>(
        'SELECT fingerprint FROM platform_diagnostic_events WHERE id=$1',
        [ref.diagnosticId],
      );
      if (!event) throw new NotFoundException('错误记录已不可用。');
      const scope = [actor.spaceId, ref.releaseId, event.fingerprint, kind, lock.id];
      const previous = await tx.one<{ id: string }>(
        `SELECT id FROM platform_asset_repair_tasks
          WHERE space_id=$1 AND release_id=$2 AND fingerprint=$3 AND asset_kind=$4 AND asset_id=$5`,
        scope,
      );
      const taskId = previous?.id ?? randomUUID();
      if (!previous) {
        await tx.execute(
          `INSERT INTO platform_asset_repair_tasks
            (space_id,release_id,fingerprint,asset_kind,asset_id,id,asset_lock,created_by)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [...scope, taskId, JSON.stringify(lock), actor.userId],
        );
      }
      await tx.execute(
        `INSERT INTO platform_asset_repair_occurrences (task_id,diagnostic_id)
          VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [taskId, ref.diagnosticId],
      );
      return { id: taskId };
    });
  }

  @Header('Cache-Control', 'no-store')
  @Get('asset-repairs')
  async list(@Headers('cookie') cookie: string | undefined) {
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    return this.db.executor.many<Task>(
      taskQuery +
        " ORDER BY (t.status='in_review') DESC,(t.status='approved'),t.updated_at DESC,t.id LIMIT 100",
      [actor.spaceId],
    );
  }

  @Header('Cache-Control', 'no-store')
  @Get('asset-repairs/reviews')
  async reviews(@Headers('cookie') cookie: string | undefined) {
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    const rows = await this.db.executor.many<Task>(
      taskQuery +
        " AND t.pull_request IS NOT NULL ORDER BY (t.status='in_review') DESC,t.updated_at DESC,t.id LIMIT 100",
      [actor.spaceId],
    );
    const repository = configuredRepository();
    return { repository, rows: await withGitHubPullRequestStatus(rows, repository) };
  }

  @Header('Cache-Control', 'no-store')
  @Get('asset-repairs/:id')
  async detail(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    const db = this.db.executor;
    const task = await this.task(db, actor.spaceId, id);
    const repository = configuredRepository();
    const [occurrences, actions, [withStatus]] = await Promise.all([
      db.many(
        `SELECT o.diagnostic_id AS "diagnosticId",o.linked_at AS "linkedAt",
            e.error_code AS "errorCode",e.phase,e.target_id AS "targetId"
          FROM platform_asset_repair_occurrences o
          LEFT JOIN platform_diagnostic_events e
            ON e.id=o.diagnostic_id AND e.release_id=$2
            AND e.received_at >= now() - interval '30 days'
          WHERE o.task_id=$1 ORDER BY o.linked_at,o.diagnostic_id LIMIT 100`,
        [task.id, task.releaseId],
      ),
      db.many(
        `SELECT revision,actor_id AS "actorId",action,detail,recorded_at AS "recordedAt"
          FROM platform_asset_repair_actions WHERE task_id=$1 AND revision<=$2 ORDER BY revision DESC LIMIT 100`,
        [task.id, task.revision],
      ),
      withGitHubPullRequestStatus([task], repository),
    ]);
    return { ...withStatus, occurrences, actions, repository };
  }

  @Header('Cache-Control', 'no-store')
  @Post('asset-repairs/:id/actions')
  @HttpCode(200)
  async action(
    @Headers('cookie') cookie: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id') id: string,
    @Body() input: Action,
  ): Promise<Receipt> {
    requireStudioOrigin(origin);
    const action = input?.action;
    const revision = input?.revision;
    if (
      (action !== 'claim' &&
        action !== 'submit' &&
        action !== 'approve' &&
        action !== 'request_changes') ||
      typeof revision !== 'number' ||
      !Number.isSafeInteger(revision) ||
      revision < 0
    )
      throw new BadRequestException('无效的资产修复任务操作。');
    const reviewing = action === 'approve' || action === 'request_changes';
    const note = typeof input.note === 'string' ? input.note.trim() : '';
    if (note.length > 500 || note.includes('\0') || (action === 'request_changes' && !note))
      throw new BadRequestException('请填写 1–500 字的修改意见。');
    const { key: requestKey, fingerprint } = requestIdentity(key, [
      action,
      revision,
      input.pullRequest?.url,
      input.pullRequest?.headSha,
      input.pullRequest?.version,
      note,
    ]);
    return this.db.transaction(async (tx) => {
      const actor = await this.access.authenticate(session(cookie), 'form:edit', tx);
      if (reviewing && !actor.permissions.includes('form:manage')) throw new ForbiddenException();
      const task = await this.task(tx, actor.spaceId, id);
      const previous = await tx.one<{ fingerprint: string; receipt: Receipt }>(
        'SELECT fingerprint,receipt FROM platform_asset_repair_actions WHERE task_id=$1 AND actor_id=$2 AND request_key=$3',
        [task.id, actor.userId, requestKey],
      );
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new ConflictException('请求键已被使用。');
        return previous.receipt;
      }
      if (task.revision !== revision) throw new ConflictException('任务已有新状态，请刷新。');

      let status: Status;
      let assignee = task.assignee;
      let pr = task.pullRequest;
      let reviewer = task.reviewer;
      if (action === 'claim') {
        if (task.status !== 'open') throw new ConflictException('任务已被认领。');
        status = 'in_progress';
        assignee = actor.userId;
      } else if (action === 'submit') {
        if (assignee !== actor.userId) throw new ForbiddenException();
        if (task.status !== 'in_progress' && task.status !== 'changes_requested')
          throw new ConflictException('任务当前无法提交审查。');
        status = 'in_review';
        pr = pullRequest(input.pullRequest, task.asset.version);
        reviewer = null;
      } else {
        if (assignee === actor.userId) throw new ForbiddenException('请由其他维护者审查。');
        if (task.status !== 'in_review' || !pr) throw new ConflictException('任务当前不在审查中。');
        status = action === 'approve' ? 'approved' : 'changes_requested';
        reviewer = actor.userId;
      }
      const receipt = { id: task.id, status, revision: task.revision + 1 };
      await tx.execute(
        `UPDATE platform_asset_repair_tasks SET status=$2,revision=$3,assignee=$4,
          pull_request=$5,reviewer=$6,updated_at=now() WHERE id=$1`,
        [task.id, status, receipt.revision, assignee, pr && JSON.stringify(pr), reviewer],
      );
      await tx.execute(
        `INSERT INTO platform_asset_repair_actions
          (task_id,revision,actor_id,request_key,fingerprint,action,receipt,detail)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          task.id,
          receipt.revision,
          actor.userId,
          requestKey,
          fingerprint,
          action,
          JSON.stringify(receipt),
          pr && JSON.stringify({ pullRequest: pr, ...(note && { note }) }),
        ],
      );
      return receipt;
    });
  }
}
