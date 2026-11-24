import type { QueryExecutor } from './database.js';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import {
  defaultSpaceId,
  hashPassword,
  usernamePattern,
  validPassword,
  verifyPassword,
} from './credentials.js';
import { PlatformDatabase } from './database.js';
const rolePermissions = {
  viewer: ['form:view'],
  editor: ['form:view', 'form:edit'],
  publisher: ['form:view', 'form:publish'],
  admin: ['form:view', 'form:edit', 'form:publish', 'form:manage', 'member:manage'],
} as const;
type Role = keyof typeof rolePermissions;
export type Permission = (typeof rolePermissions.admin)[number];
export type AccessContext = {
  userId: string;
  memberId: string;
  spaceId: string;
  permissions: Permission[];
};
export const sessionDuration = 8 * 60 * 60 * 1000;
export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
@Injectable()
export class PlatformAccess {
  constructor(private readonly storage: PlatformDatabase) {}
  async login(username: unknown, password: unknown, db: QueryExecutor = this.storage.executor) {
    if (
      typeof username !== 'string' ||
      !usernamePattern.test(username) ||
      !validPassword(password)
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const credential = (await db.one(
      'SELECT user_id, salt, password_hash FROM platform_credentials WHERE username = $1',
      [username],
    )) as
      | {
          user_id: string;
          salt: string;
          password_hash: string;
        }
      | undefined;
    const valid = await verifyPassword(
      password,
      credential?.salt ?? '0'.repeat(32),
      credential?.password_hash ?? '0'.repeat(128),
    );
    if (!credential || !valid) throw new UnauthorizedException('Invalid credentials');
    const token = randomBytes(32).toString('base64url');
    const context = await this.storage.transaction(async (db) => {
      const latest = await db.one(
        'SELECT password_hash FROM platform_credentials WHERE user_id=$1',
        [credential.user_id],
      );
      if (latest?.password_hash !== credential.password_hash)
        throw new UnauthorizedException('Credentials changed');
      return await this.insertSession(credential.user_id, 'builtin', token, db);
    });
    return { token, context };
  }
  async issueSession(userId: string, source: string) {
    const token = randomBytes(32).toString('base64url');
    const context = await this.storage.transaction(
      async (db) => await this.insertSession(userId, source, token, db),
    );
    return { token, context };
  }
  // Call within a write transaction when issuing from a revocable external binding.
  async insertSession(
    userId: string,
    source: string,
    token: string,
    db: QueryExecutor = this.storage.executor,
  ) {
    const account = await this.accountForUser(userId, db);
    const context =
      account.membership.status === 'active' ? await this.contextForUser(userId, db) : account;
    await db.execute(
      'INSERT INTO platform_sessions (token_hash, user_id, source, expires_at) VALUES ($1, $2, $3, $4)',
      [tokenHash(token), userId, source, Date.now() + sessionDuration],
    );
    return context;
  }
  async verifyCurrentPassword(
    token: string | undefined,
    password: unknown,
    db: QueryExecutor = this.storage.executor,
  ) {
    const { userId } = await this.account(token, db);
    const credential = await db.one(
      'SELECT salt, password_hash FROM platform_credentials WHERE user_id = $1',
      [userId],
    );
    if (
      !validPassword(password) ||
      !credential ||
      !(await verifyPassword(password, String(credential.salt), String(credential.password_hash)))
    ) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return { userId, passwordHash: String(credential.password_hash) };
  }
  async recheckPasswordProof(
    token: string,
    proof: {
      userId: string;
      passwordHash: string;
    },
    db: QueryExecutor = this.storage.executor,
  ) {
    const current = await this.account(token, db);
    const credential = await db.one(
      'SELECT password_hash FROM platform_credentials WHERE user_id=$1',
      [current.userId],
    );
    if (current.userId !== proof.userId || credential?.password_hash !== proof.passwordHash)
      throw new UnauthorizedException('Credentials changed');
  }
  async changePassword(
    token: string | undefined,
    currentPassword: unknown,
    password: unknown,
    db: QueryExecutor = this.storage.executor,
  ) {
    const context = await this.account(token, db);
    if (!validPassword(password) || password.length < 12)
      throw new BadRequestException(
        'Password must contain at least 12 characters and at most 256 bytes',
      );
    const credential = await db.one(
      'SELECT salt,password_hash FROM platform_credentials WHERE user_id=$1',
      [context.userId],
    );
    if (
      !credential ||
      !validPassword(currentPassword) ||
      !(await verifyPassword(
        currentPassword,
        String(credential.salt),
        String(credential.password_hash),
      ))
    )
      throw new UnauthorizedException('Invalid credentials');
    const replacement = await hashPassword(password);
    await this.storage.transaction(async (db) => {
      const current = await this.account(token, db);
      const latest = await db.one(
        'SELECT password_hash FROM platform_credentials WHERE user_id=$1',
        [context.userId],
      );
      if (latest?.password_hash !== credential.password_hash)
        throw new ConflictException('Password already changed');
      await db.execute(
        'UPDATE platform_credentials SET salt=$1,password_hash=$2 WHERE user_id=$3',
        [replacement.salt, replacement.hash, current.userId],
      );
      await db.execute(
        'UPDATE platform_sessions SET revoked_at=$1 WHERE user_id=$2 AND token_hash<>$3 AND revoked_at IS NULL',
        [Date.now(), current.userId, tokenHash(token!)],
      );
      await db.execute(
        'INSERT INTO platform_account_changes (user_id,actor_id,state,recorded_at) VALUES ($1,$2,$3,$4)',
        [
          current.userId,
          current.userId,
          JSON.stringify({ action: 'change-password', result: 'success' }),
          new Date().toISOString(),
        ],
      );
    });
    return { changed: true };
  }
  async revokeSession(token: string | undefined) {
    if (!token) return;
    const hash = tokenHash(token);
    await this.storage.transaction(async (db) => {
      await db.execute(
        'UPDATE platform_sessions SET revoked_at = $1 WHERE token_hash = $2 AND revoked_at IS NULL',
        [Date.now(), hash],
      );
      await db.execute('DELETE FROM platform_github_flows WHERE browser_hash = $1', [hash]);
      await db.execute('DELETE FROM platform_password_setup_proofs WHERE browser_hash = $1', [
        hash,
      ]);
      await db.execute('DELETE FROM platform_github_registrations WHERE browser_hash = $1', [hash]);
    });
  }
  async hasSession(token: string, db: QueryExecutor = this.storage.executor) {
    return (await this.activeSession(token, db)) !== undefined;
  }
  private async activeSession(token: string, db: QueryExecutor = this.storage.executor) {
    return await db.one(
      `SELECT user_id FROM platform_sessions
        WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2
          AND (source != 'local-development' OR $3 = 1)`,
      [
        tokenHash(token),
        Date.now(),
        process.env.NODE_ENV === 'development' && process.env.PLATFORM_LOCAL_LOGIN === 'true'
          ? 1
          : 0,
      ],
    );
  }
  async account(token: string | undefined, db: QueryExecutor = this.storage.executor) {
    if (!token) throw new UnauthorizedException();
    const session = await this.activeSession(token, db);
    if (!session) throw new UnauthorizedException();
    return await this.accountForUser(String(session.user_id), db);
  }
  async accountForUser(userId: string, db: QueryExecutor = this.storage.executor) {
    const user = await db.one('SELECT active FROM platform_users WHERE user_id=$1', [userId]);
    if (user?.active !== 1) throw new UnauthorizedException();
    const credential = await db.one('SELECT username FROM platform_credentials WHERE user_id=$1', [
      userId,
    ]);
    const binding = await db.one(
      'SELECT github_login FROM platform_github_bindings WHERE user_id=$1 AND revoked_at IS NULL',
      [userId],
    );
    const member = await db.one(
      'SELECT member_id,active FROM platform_members WHERE user_id=$1 AND space_id=$2',
      [userId, defaultSpaceId],
    );
    const status = !member
      ? ('none' as const)
      : member.active === 1
        ? ('active' as const)
        : ('suspended' as const);
    return {
      userId,
      username: credential ? String(credential.username) : null,
      githubLogin: binding ? String(binding.github_login) : null,
      hasPassword: Boolean(credential),
      membership: {
        spaceId: defaultSpaceId,
        status,
        ...(member ? { memberId: String(member.member_id) } : {}),
        permissions:
          status === 'active'
            ? (await this.contextForUser(userId, db)).permissions
            : ([] as Permission[]),
      },
    };
  }
  async authenticate(
    token: string | undefined,
    permission?: Permission,
    db: QueryExecutor = this.storage.executor,
  ): Promise<AccessContext> {
    if (!token) throw new UnauthorizedException();
    const session = await this.activeSession(token, db);
    if (!session) throw new UnauthorizedException();
    const context = await this.contextForUser(String(session.user_id), db);
    if (permission && !context.permissions.includes(permission)) throw new ForbiddenException();
    return context;
  }
  async contextForUser(
    userId: string,
    db: QueryExecutor = this.storage.executor,
  ): Promise<AccessContext> {
    const user = await db.one('SELECT active FROM platform_users WHERE user_id = $1', [userId]);
    if (user?.active !== 1) throw new UnauthorizedException();
    const member = await db.one(
      'SELECT member_id FROM platform_members WHERE user_id = $1 AND space_id = $2 AND active = 1',
      [userId, defaultSpaceId],
    );
    if (!member) throw new ForbiddenException();
    const memberId = String(member.member_id);
    const roles = await db.many(
      'SELECT role FROM platform_member_roles WHERE member_id = $1 ORDER BY role',
      [memberId],
    );
    const permissions = new Set<Permission>();
    for (const row of roles) {
      for (const permission of rolePermissions[row.role as Role]) permissions.add(permission);
    }
    return { userId, memberId, spaceId: defaultSpaceId, permissions: [...permissions] };
  }
}
