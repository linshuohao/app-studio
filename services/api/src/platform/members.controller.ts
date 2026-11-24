import type { QueryExecutor } from './database.js';
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PlatformAccess } from './access.js';
import { hashPassword, validPassword, usernamePattern } from './credentials.js';
import { PlatformDatabase } from './database.js';
import { requireStudioOrigin, session } from './session-http.js';
import { roles } from './roles.js';
@Controller('api/platform/members')
export class MembersController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly storage: PlatformDatabase,
  ) {}
  private async rows(spaceId: string, db: QueryExecutor = this.storage.executor) {
    const rows = await db.many(
      `SELECT m.member_id AS "memberId", m.user_id AS "userId",
      c.username, (SELECT github_login FROM platform_github_bindings g WHERE g.user_id=m.user_id AND revoked_at IS NULL) AS "githubLogin", m.active, u.active AS "userActive",
      COALESCE((SELECT MAX(sequence) FROM platform_member_changes a WHERE a.member_id=m.member_id AND (a.state::jsonb ->> 'action') IS DISTINCT FROM 'change-password'), 0) AS revision,
      ARRAY(SELECT role FROM platform_member_roles r WHERE r.member_id=m.member_id ORDER BY role) AS roles
      FROM platform_members m JOIN platform_users u ON u.user_id=m.user_id
      LEFT JOIN platform_credentials c ON c.user_id=m.user_id WHERE m.space_id=$1 ORDER BY c.username, m.member_id`,
      [spaceId],
    );
    return rows.map((row) => ({
      memberId: String(row.memberId),
      userId: String(row.userId),
      username: row.username === null ? null : String(row.username),
      githubLogin: row.githubLogin === null ? null : String(row.githubLogin),
      revision: Number(row.revision),
      active: row.active === 1,
      userActive: row.userActive === 1,
      roles: row.roles as string[],
    }));
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    const db = this.storage.executor;
    const context = await this.access.authenticate(session(cookie), 'member:manage', db);
    return await this.rows(context.spaceId, db);
  }
  @Post()
  @Header('Cache-Control', 'no-store')
  async add(
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('origin')
    origin: string | undefined,
    @Body()
    input:
      | {
          username?: unknown;
          roles?: unknown;
          createAccount?: unknown;
          identityVerified?: unknown;
          password?: unknown;
        }
      | undefined,
  ) {
    const db = this.storage.executor;
    requireStudioOrigin(origin);
    await this.access.authenticate(session(cookie), 'member:manage', db);
    const chosen = roles(input?.roles);
    if (typeof input?.username !== 'string' || !usernamePattern.test(input.username))
      throw new BadRequestException('Invalid username');
    if (input.createAccount !== undefined && typeof input.createAccount !== 'boolean')
      throw new BadRequestException('Invalid account mode');
    if (
      input.createAccount &&
      (input.identityVerified !== true ||
        !validPassword(input.password) ||
        input.password.length < 12)
    )
      throw new BadRequestException(
        'Verify identity and provide a password of at least 12 characters, at most 256 bytes',
      );
    const credential = input.createAccount
      ? await hashPassword(input.password as string)
      : undefined;
    return await this.storage.transaction(async (db) => {
      const context = await this.access.authenticate(session(cookie), 'member:manage', db);
      let user = await db.one(
        'SELECT c.user_id FROM platform_credentials c JOIN platform_users u ON c.user_id=u.user_id WHERE c.username=$1 AND u.active=1',
        [input.username as string],
      );
      if (credential) {
        if (
          await db.one('SELECT 1 FROM platform_credentials WHERE username=$1', [
            input.username as string,
          ])
        )
          throw new ConflictException('Username already exists');
        const userId = randomUUID();
        await db.execute('INSERT INTO platform_users VALUES ($1,1)', [userId]);
        await db.execute('INSERT INTO platform_credentials VALUES ($1,$2,$3,$4)', [
          input.username as string,
          userId,
          credential.salt,
          credential.hash,
        ]);
        user = { user_id: userId };
      }
      if (!user) throw new NotFoundException('Existing active account not found');
      if (
        await db.one('SELECT 1 FROM platform_members WHERE space_id=$1 AND user_id=$2', [
          context.spaceId,
          user.user_id!,
        ])
      )
        throw new ConflictException('Account is already a member');
      const memberId = randomUUID();
      await db.execute(
        'INSERT INTO platform_members (member_id,user_id,space_id,active) VALUES ($1,$2,$3,1)',
        [memberId, user.user_id!, context.spaceId],
      );
      await this.replaceRoles(memberId, chosen, db);
      await this.audit(
        memberId,
        context.userId,
        {
          action: credential ? 'create-account-and-member' : 'associate-member',
          identityVerified: credential ? true : undefined,
          before: null,
          after: { active: true, roles: chosen },
          result: 'success',
        },
        db,
      );
      return (await this.rows(context.spaceId, db)).find((row) => row.memberId === memberId);
    });
  }
  @Post(':memberId')
  @Header('Cache-Control', 'no-store')
  async update(
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('origin')
    origin: string | undefined,
    @Param('memberId')
    memberId: string,
    @Body()
    input:
      | {
          revision?: unknown;
          active?: unknown;
          roles?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.storage.transaction(async (db) => {
      const context = await this.access.authenticate(session(cookie), 'member:manage', db);
      const chosen = roles(input?.roles);
      if (typeof input?.active !== 'boolean' || !Number.isSafeInteger(input.revision))
        throw new BadRequestException('Active state and revision required');
      const current = (await this.rows(context.spaceId, db)).find(
        (row) => row.memberId === memberId,
      );
      if (!current) throw new NotFoundException('Member not found');
      if (input.revision !== current.revision)
        throw new ConflictException('Member changed; refresh before editing');
      await db.execute('UPDATE platform_members SET active=$1 WHERE member_id=$2', [
        Number(input.active),
        memberId,
      ]);
      await this.replaceRoles(memberId, chosen, db);
      const admin = await db.one(
        "SELECT 1 FROM platform_members m JOIN platform_users u ON u.user_id=m.user_id JOIN platform_member_roles r ON r.member_id=m.member_id WHERE m.space_id=$1 AND m.active=1 AND u.active=1 AND r.role='admin' LIMIT 1",
        [context.spaceId],
      );
      if (!admin) throw new ConflictException('At least one active administrator is required');
      await this.audit(
        memberId,
        context.userId,
        {
          before: { active: current.active, roles: current.roles },
          after: { active: input.active, roles: chosen },
          result: 'success',
        },
        db,
      );
      return (await this.rows(context.spaceId, db)).find((row) => row.memberId === memberId);
    });
  }
  private async replaceRoles(
    memberId: string,
    chosen: string[],
    db: QueryExecutor = this.storage.executor,
  ) {
    await db.execute('DELETE FROM platform_member_roles WHERE member_id=$1', [memberId]);
    for (const role of chosen)
      await db.execute('INSERT INTO platform_member_roles VALUES ($1,$2)', [memberId, role]);
  }
  private async audit(
    memberId: string,
    actorId: string,
    state: unknown,
    db: QueryExecutor = this.storage.executor,
  ) {
    await db.execute(
      'INSERT INTO platform_member_changes (member_id,actor_id,state,recorded_at) VALUES ($1,$2,$3,$4)',
      [memberId, actorId, JSON.stringify(state), new Date().toISOString()],
    );
  }
}
