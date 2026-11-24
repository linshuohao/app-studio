import type { QueryExecutor } from './database.js';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlatformAccess } from './access.js';
import { PlatformDatabase } from './database.js';
import { defaultSpaceId } from './credentials.js';
import { roles } from './roles.js';
import { requireStudioOrigin, session } from './session-http.js';
const states = ['pending', 'approved', 'rejected', 'withdrawn'];
const projection = `SELECT r.*, c.username,
 (SELECT github_login FROM platform_github_bindings g WHERE g.user_id=r.user_id AND revoked_at IS NULL) AS github_login
 FROM platform_join_requests r LEFT JOIN platform_credentials c ON c.user_id=r.user_id`;
type Row = {
  request_id: string;
  user_id: string;
  space_id: string;
  username: string | null;
  github_login: string | null;
  explanation: string;
  status: string;
  revision: number;
  created_at: string;
  decided_at: string | null;
  decided_by: string | null;
  reason: string | null;
  roles: string;
};
function output(row: Row) {
  return {
    requestId: row.request_id,
    userId: row.user_id,
    spaceId: row.space_id,
    username: row.username,
    githubLogin: row.github_login,
    explanation: row.explanation,
    status: row.status,
    revision: row.revision,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedBy: row.decided_by,
    reason: row.reason,
    roles: JSON.parse(row.roles) as string[],
  };
}
function explanation(value: unknown, name: string) {
  if (
    typeof value !== 'string' ||
    value.includes('\0') ||
    !value.trim() ||
    value.trim().length > 1000
  )
    throw new BadRequestException(name + ' must contain 1 to 1000 characters');
  return value.trim();
}
function pageNumber(value: unknown, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !/^\d+$/.test(value))
    throw new BadRequestException('Invalid pagination');
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number > maximum)
    throw new BadRequestException('Invalid pagination');
  return number;
}
@Controller('api/platform/join-requests')
export class JoinRequestsController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly storage: PlatformDatabase,
  ) {}
  @Get('mine')
  @Header('Cache-Control', 'no-store')
  async mine(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    const db = this.storage.executor;
    const account = await this.access.account(session(cookie), db);
    const row = (await db.one(
      projection + ' WHERE r.user_id=$1 AND r.space_id=$2 ORDER BY r.sequence DESC LIMIT 1',
      [account.userId, defaultSpaceId],
    )) as Row | undefined;
    return { request: row ? output(row) : null };
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Headers('cookie')
    cookie: string | undefined,
    @Query('status')
    status: unknown,
    @Query('offset')
    offsetInput: unknown,
    @Query('limit')
    limitInput: unknown,
  ) {
    const db = this.storage.executor;
    const context = await this.access.authenticate(session(cookie), 'member:manage', db);
    const state = status === undefined ? 'pending' : status;
    if (typeof state !== 'string' || (!states.includes(state) && state !== 'all'))
      throw new BadRequestException('Invalid status');
    const offset = pageNumber(offsetInput, 0, 1000000);
    const limit = pageNumber(limitInput, 20, 100);
    if (!limit) throw new BadRequestException('Limit must be positive');
    const condition = state === 'all' ? 'r.space_id=$1' : 'r.space_id=$1 AND r.status=$2';
    const args = state === 'all' ? [context.spaceId] : [context.spaceId, state];
    const rows = (await db.many(
      projection +
        ' WHERE ' +
        condition +
        ` ORDER BY r.sequence DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
      [...args, limit, offset],
    )) as Row[];
    const total = Number(
      (
        await db.one('SELECT COUNT(*) AS n FROM platform_join_requests r WHERE ' + condition, [
          ...args,
        ])
      )?.n,
    );
    return { items: rows.map(output), total, offset, limit };
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async detail(
    @Headers('cookie')
    cookie: string | undefined,
    @Param('id')
    id: string,
  ) {
    const db = this.storage.executor;
    const context = await this.access.authenticate(session(cookie), 'member:manage', db);
    return output(await this.find(id, context.spaceId, db));
  }
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async create(
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('origin')
    origin: string | undefined,
    @Body()
    input:
      | {
          explanation?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.storage.transaction(async (db) => {
      const account = await this.access.account(session(cookie), db);
      if (account.membership.status !== 'none')
        throw new ConflictException('Account already has a membership; contact an administrator');
      const pending = (await db.one(
        projection + " WHERE r.user_id=$1 AND r.space_id=$2 AND r.status='pending'",
        [account.userId, defaultSpaceId],
      )) as Row | undefined;
      if (pending) return output(pending);
      const text = explanation(input?.explanation, 'Explanation');
      const count = await db.one(
        'SELECT COUNT(*) AS n FROM platform_join_requests WHERE user_id=$1 AND created_at>$2',
        [account.userId, new Date(Date.now() - 3600000).toISOString()],
      );
      if (Number(count?.n) >= 10)
        throw new HttpException('Too many join requests; try again later', 429);
      const requestId = randomUUID();
      await db.execute(
        "INSERT INTO platform_join_requests (request_id,user_id,space_id,explanation,status,created_at) VALUES ($1,$2,$3,$4,'pending',$5)",
        [requestId, account.userId, defaultSpaceId, text, new Date().toISOString()],
      );
      return output(await this.find(requestId, defaultSpaceId, db));
    });
  }
  @Post(':id/withdraw')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async withdraw(
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('origin')
    origin: string | undefined,
    @Param('id')
    id: string,
    @Body()
    input:
      | {
          revision?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.storage.transaction(async (db) => {
      const account = await this.access.account(session(cookie), db);
      const row = await this.find(id, defaultSpaceId, db);
      if (row.user_id !== account.userId) throw new NotFoundException('Request not found');
      this.checkPending(row, input?.revision);
      await db.execute(
        "UPDATE platform_join_requests SET status='withdrawn',revision=revision+1,decided_at=$1,decided_by=$2 WHERE request_id=$3",
        [new Date().toISOString(), account.userId, id],
      );
      return output(await this.find(id, defaultSpaceId, db));
    });
  }
  @Post(':id/decision')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async decide(
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('origin')
    origin: string | undefined,
    @Param('id')
    id: string,
    @Body()
    input:
      | {
          revision?: unknown;
          decision?: unknown;
          roles?: unknown;
          reason?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.storage.transaction(async (db) => {
      const context = await this.access.authenticate(session(cookie), 'member:manage', db);
      const row = await this.find(id, context.spaceId, db);
      this.checkPending(row, input?.revision);
      if (input?.decision !== 'approve' && input?.decision !== 'reject')
        throw new BadRequestException('Choose approve or reject');
      const chosen = input.decision === 'approve' ? roles(input.roles) : [];
      const reason = input.decision === 'reject' ? explanation(input.reason, 'Reason') : null;
      const user = await db.one('SELECT active FROM platform_users WHERE user_id=$1', [
        row.user_id,
      ]);
      if (user?.active !== 1) throw new ConflictException('Applicant account is inactive');
      if (
        await db.one('SELECT 1 FROM platform_members WHERE user_id=$1 AND space_id=$2', [
          row.user_id,
          context.spaceId,
        ])
      )
        throw new ConflictException('Applicant already has a membership; refresh');
      const now = new Date().toISOString();
      if (input.decision === 'approve') {
        const memberId = randomUUID();
        await db.execute(
          'INSERT INTO platform_members (member_id,user_id,space_id,active) VALUES ($1,$2,$3,1)',
          [memberId, row.user_id, context.spaceId],
        );
        for (const role of chosen)
          await db.execute('INSERT INTO platform_member_roles VALUES ($1,$2)', [memberId, role]);
        await db.execute(
          'INSERT INTO platform_member_changes (member_id,actor_id,state,recorded_at) VALUES ($1,$2,$3,$4)',
          [
            memberId,
            context.userId,
            JSON.stringify({
              action: 'approve-join-request',
              requestId: id,
              before: null,
              after: { active: true, roles: chosen },
              result: 'success',
            }),
            now,
          ],
        );
      }
      await db.execute(
        'UPDATE platform_join_requests SET status=$1,revision=revision+1,decided_at=$2,decided_by=$3,reason=$4,roles=$5 WHERE request_id=$6',
        [
          input.decision === 'approve' ? 'approved' : 'rejected',
          now,
          context.userId,
          reason,
          JSON.stringify(chosen),
          id,
        ],
      );
      return output(await this.find(id, context.spaceId, db));
    });
  }
  private async find(id: string, spaceId: string, db: QueryExecutor = this.storage.executor) {
    const row = (await db.one(projection + ' WHERE r.request_id=$1 AND r.space_id=$2', [
      id,
      spaceId,
    ])) as Row | undefined;
    if (!row) throw new NotFoundException('Request not found');
    return row;
  }
  private checkPending(row: Row, revision: unknown) {
    if (!Number.isSafeInteger(revision) || Number(revision) < 0)
      throw new BadRequestException('Revision required');
    if (row.status !== 'pending' || revision !== row.revision)
      throw new ConflictException('Request changed; refresh before continuing');
  }
}
