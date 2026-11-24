import type { QueryExecutor } from './database.js';
import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  HttpException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { PlatformAccess, tokenHash } from './access.js';
import { PlatformDatabase } from './database.js';
import { GitHubProvider } from './github-provider.js';
import { hashPassword, usernamePattern, validPassword } from './credentials.js';
const flowDuration = 5 * 60 * 1000;
const opaqueToken = /^[A-Za-z0-9_-]{43}$/;
type OAuthFlow = {
  user_id: string | null;
  verifier: string;
  binding_sequence: number;
  expires_at: number;
  started_at: number;
  purpose: 'login' | 'bind' | 'password-setup';
};
function githubSource(sequence: number) {
  return 'github:' + sequence;
}
@Injectable()
export class GitHubAccess {
  constructor(
    private readonly storage: PlatformDatabase,
    private readonly access: PlatformAccess,
    private readonly provider: GitHubProvider,
  ) {}
  private readonly loginAttempts = new Map<
    string,
    {
      count: number;
      expires: number;
    }
  >();
  async status(token: string | undefined, db: QueryExecutor = this.storage.executor) {
    const user = await this.access.account(token, db);
    const binding = await this.bindingForUser(user.userId, db);
    return { enabled: this.provider.enabled, login: binding?.github_login ?? null };
  }
  get enabled() {
    return this.provider.enabled;
  }
  async startLogin(previous: string | undefined, address = 'internal') {
    const now = Date.now();
    for (const [key, item] of this.loginAttempts)
      if (item.expires <= now) this.loginAttempts.delete(key);
    const attempts = this.loginAttempts.get(address) ?? { count: 0, expires: now + flowDuration };
    if (
      attempts.count >= 30 ||
      (this.loginAttempts.size >= 10000 && !this.loginAttempts.has(address))
    )
      throw new HttpException('Too many GitHub login attempts; try again later', 429);
    attempts.count += 1;
    this.loginAttempts.set(address, attempts);
    const token = randomBytes(32).toString('base64url');
    const url = await this.storage.transaction(async (db) => {
      if (previous && (await this.access.hasSession(previous, db))) {
        throw new ConflictException('Sign out before starting GitHub login');
      }
      const sequence = await this.latestBindingSequence(undefined, db);
      await this.deleteBrowserFlows(previous, db);
      return await this.start(token, null, sequence, undefined, db);
    });
    return { token, url };
  }
  async startBinding(
    token: string | undefined,
    password: unknown,
    db: QueryExecutor = this.storage.executor,
  ) {
    if (!token) throw new UnauthorizedException();
    const { userId } = await this.access.account(token, db);
    const sequence = await this.latestBindingSequence(userId, db);
    const proof = await this.access.verifyCurrentPassword(token, password, db);
    return await this.storage.transaction(async (db) => {
      await this.access.recheckPasswordProof(token, proof, db);
      if (
        (await this.bindingForUser(userId, db)) ||
        (await this.latestBindingSequence(userId, db)) !== sequence
      ) {
        throw new ConflictException('GitHub binding changed');
      }
      return await this.start(token, userId, sequence, undefined, db);
    });
  }
  async unbind(
    token: string | undefined,
    password: unknown,
    db: QueryExecutor = this.storage.executor,
  ) {
    if (!token) throw new UnauthorizedException();
    const account = await this.access.account(token, db);
    const { userId } = account;
    if (!account.hasPassword)
      throw new ConflictException(
        'Set an internal password before removing your only login method',
      );
    const binding = await this.bindingForUser(userId, db);
    const proof = await this.access.verifyCurrentPassword(token, password, db);
    await this.storage.transaction(async (db) => {
      await this.access.recheckPasswordProof(token, proof, db);
      const current = await this.bindingForUser(userId, db);
      if (current?.sequence !== binding?.sequence) throw new ConflictException('Binding changed');
      if (!current) return;
      const now = Date.now();
      const source = githubSource(current.sequence);
      await db.execute('DELETE FROM platform_password_setup_proofs WHERE user_id=$1', [userId]);
      await db.execute(
        "DELETE FROM platform_github_flows WHERE user_id=$1 AND purpose='password-setup'",
        [userId],
      );
      await db.execute('UPDATE platform_github_bindings SET revoked_at = $1 WHERE sequence = $2', [
        now,
        current.sequence,
      ]);
      await db.execute(
        'UPDATE platform_sessions SET revoked_at = $1 WHERE source = $2 AND revoked_at IS NULL',
        [now, source],
      );
    });
  }
  async complete(
    token: string | undefined,
    state: unknown,
    code: unknown,
    error: unknown,
    db: QueryExecutor = this.storage.executor,
  ) {
    if (!token || typeof state !== 'string' || !opaqueToken.test(state)) return 'invalid';
    const stateHash = tokenHash(state);
    const flow = await this.storage.transaction(
      async (db) =>
        (await db.one(
          `
        UPDATE platform_github_flows SET consumed = 1
        WHERE state_hash = $1 AND browser_hash = $2 AND consumed = 0 AND expires_at > $3
        RETURNING user_id, verifier, binding_sequence, expires_at, started_at, purpose
      `,
          [stateHash, tokenHash(token), Date.now()],
        )) as OAuthFlow | undefined,
    );
    if (!flow) return 'invalid';
    try {
      if (error === 'access_denied') return 'cancelled';
      if (error !== undefined || typeof code !== 'string' || !code || code.length > 512)
        return 'invalid';
      let identity;
      try {
        identity = await this.provider.identify(code, flow.verifier);
      } catch {
        return 'unavailable';
      }
      return await this.storage.transaction(async (db) => {
        if (
          flow.expires_at <= Date.now() ||
          !(await db.one('SELECT 1 FROM platform_github_flows WHERE state_hash = $1', [stateHash]))
        ) {
          return 'invalid';
        }
        const binding = await db.one(
          'SELECT sequence, user_id FROM platform_github_bindings WHERE github_id = $1 AND revoked_at IS NULL',
          [identity.id],
        );
        if (flow.purpose === 'password-setup') {
          const account = await this.access.account(token, db);
          if (account.userId !== flow.user_id || account.hasPassword) return 'invalid';
          if (
            !binding ||
            binding.user_id !== account.userId ||
            Number(binding.sequence) !== flow.binding_sequence
          )
            return 'conflict';
          await db.execute(
            'INSERT INTO platform_password_setup_proofs (browser_hash,proof_id,user_id,binding_sequence,github_id,expires_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (browser_hash) DO UPDATE SET proof_id=EXCLUDED.proof_id,user_id=EXCLUDED.user_id,binding_sequence=EXCLUDED.binding_sequence,github_id=EXCLUDED.github_id,expires_at=EXCLUDED.expires_at',
            [
              tokenHash(token),
              randomUUID(),
              account.userId,
              flow.binding_sequence,
              identity.id,
              Date.now() + flowDuration,
            ],
          );
          return 'password-setup-verified';
        }
        if (flow.purpose === 'bind' && flow.user_id) {
          const current = await this.access.account(token, db);
          if (
            current.userId !== flow.user_id ||
            (await this.latestBindingSequence(current.userId, db)) !== flow.binding_sequence
          )
            return 'invalid';
          if (binding || (await this.bindingForUser(current.userId, db))) return 'conflict';
          await db.execute(
            'INSERT INTO platform_github_bindings (user_id, github_id, github_login) VALUES ($1, $2, $3)',
            [current.userId, identity.id, identity.login],
          );
          return 'bound';
        }
        if (flow.purpose !== 'login' || flow.user_id) return 'invalid';
        if (!binding) {
          const previous = await this.identityHistory(identity.id, db);
          // A login begun before unlink must never turn into a new registration.
          if (
            previous &&
            (Number(previous.sequence) > flow.binding_sequence ||
              Number(previous.revoked_at) >= flow.started_at)
          )
            return 'invalid';
          if (await this.access.hasSession(token, db)) return 'invalid';
          await db.execute(
            'INSERT INTO platform_github_registrations (browser_hash,github_id,github_login,history_sequence,history_revoked_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (browser_hash) DO UPDATE SET github_id=EXCLUDED.github_id,github_login=EXCLUDED.github_login,history_sequence=EXCLUDED.history_sequence,history_revoked_at=EXCLUDED.history_revoked_at,expires_at=EXCLUDED.expires_at',
            [
              tokenHash(token),
              identity.id,
              identity.login,
              Number(previous?.sequence ?? 0),
              previous?.revoked_at ?? null,
              Date.now() + flowDuration,
            ],
          );
          return 'registration-required';
        }
        const sequence = Number(binding.sequence);
        if (sequence > flow.binding_sequence || (await this.access.hasSession(token, db)))
          return 'invalid';
        await this.access.insertSession(String(binding.user_id), githubSource(sequence), token, db);
        return 'signed-in';
      });
    } catch (failure) {
      if (failure instanceof UnauthorizedException) return 'invalid';
      return 'unavailable';
    } finally {
      await db.execute('DELETE FROM platform_github_flows WHERE state_hash = $1', [stateHash]);
    }
  }
  async startPasswordSetup(token: string | undefined) {
    if (!token) throw new UnauthorizedException();
    return await this.storage.transaction(async (db) => {
      const account = await this.access.account(token, db);
      if (account.hasPassword) throw new ConflictException('Internal login is already configured');
      const binding = await this.bindingForUser(account.userId, db);
      if (!binding) throw new ConflictException('GitHub binding is required');
      await db.execute('DELETE FROM platform_password_setup_proofs WHERE browser_hash=$1', [
        tokenHash(token),
      ]);
      await db.execute(
        "DELETE FROM platform_github_flows WHERE browser_hash=$1 AND purpose='password-setup'",
        [tokenHash(token)],
      );
      return {
        url: await this.start(token, account.userId, binding.sequence, 'password-setup', db),
      };
    });
  }
  async passwordSetupStatus(token: string | undefined, db: QueryExecutor = this.storage.executor) {
    const account = await this.access.account(token, db);
    const proof = await this.validSetupProof(token!, account.userId, db);
    return {
      enabled: this.enabled,
      hasPassword: account.hasPassword,
      githubLogin: account.githubLogin,
      verified: !account.hasPassword && Boolean(proof),
      expiresAt: !account.hasPassword && proof ? proof.expires_at : null,
    };
  }
  async setupPassword(
    token: string | undefined,
    username: unknown,
    password: unknown,
    db: QueryExecutor = this.storage.executor,
  ) {
    const account = await this.access.account(token, db);
    if (account.hasPassword) throw new ConflictException('Internal login is already configured');
    if (typeof username !== 'string' || !usernamePattern.test(username))
      throw new BadRequestException('Invalid username');
    if (!validPassword(password) || password.length < 12)
      throw new BadRequestException(
        'Password must contain at least 12 characters and at most 256 bytes',
      );
    const proof = await this.validSetupProof(token!, account.userId, db);
    if (!proof) throw new ForbiddenException('Reverify GitHub identity before setting a password');
    const credential = await hashPassword(password);
    return await this.storage.transaction(async (db) => {
      const current = await this.access.account(token, db);
      if (current.hasPassword) throw new ConflictException('Internal login is already configured');
      const latest = await this.validSetupProof(token!, current.userId, db);
      if (current.userId !== account.userId || latest?.proof_id !== proof.proof_id)
        throw new ForbiddenException('Verification expired or changed; reverify GitHub identity');
      if (await db.one('SELECT 1 FROM platform_credentials WHERE username=$1', [username]))
        throw new ConflictException('Username already exists');
      await db.execute(
        'INSERT INTO platform_credentials (username,user_id,salt,password_hash) VALUES ($1,$2,$3,$4)',
        [username, current.userId, credential.salt, credential.hash],
      );
      await db.execute(
        'UPDATE platform_sessions SET revoked_at=$1 WHERE user_id=$2 AND token_hash<>$3 AND revoked_at IS NULL',
        [Date.now(), current.userId, tokenHash(token!)],
      );
      await db.execute('DELETE FROM platform_password_setup_proofs WHERE user_id=$1', [
        current.userId,
      ]);
      await db.execute(
        "DELETE FROM platform_github_flows WHERE user_id=$1 AND purpose='password-setup'",
        [current.userId],
      );
      await db.execute(
        'INSERT INTO platform_account_changes (user_id,actor_id,state,recorded_at) VALUES ($1,$2,$3,$4)',
        [
          current.userId,
          current.userId,
          JSON.stringify({ action: 'setup-password', result: 'success' }),
          new Date().toISOString(),
        ],
      );
      return await this.access.accountForUser(current.userId, db);
    });
  }
  private async validSetupProof(
    token: string,
    userId: string,
    db: QueryExecutor = this.storage.executor,
  ) {
    return (await db.one(
      `SELECT p.proof_id,p.expires_at FROM platform_password_setup_proofs p
      JOIN platform_github_bindings b ON b.sequence=p.binding_sequence AND b.github_id=p.github_id AND b.user_id=p.user_id
      WHERE p.browser_hash=$1 AND p.user_id=$2 AND p.expires_at>$3 AND b.revoked_at IS NULL`,
      [tokenHash(token), userId, Date.now()],
    )) as
      | {
          proof_id: string;
          expires_at: number;
        }
      | undefined;
  }
  async registration(token: string | undefined, db: QueryExecutor = this.storage.executor) {
    const pending = await this.pendingRegistration(token, db);
    return { login: pending.github_login, expiresAt: pending.expires_at };
  }
  async register(token: string | undefined) {
    return await this.storage.transaction(async (db) => {
      // A successful confirmation may lose its response; the same browser session recovers it.
      if (token && (await this.access.hasSession(token, db)))
        return await this.access.account(token, db);
      const pending = await this.pendingRegistration(token, db);
      const current = await this.identityHistory(pending.github_id, db);
      if (
        (await this.access.hasSession(token!, db)) ||
        Number(current?.sequence ?? 0) !== pending.history_sequence ||
        (current?.revoked_at ?? null) !== pending.history_revoked_at
      )
        throw new ConflictException('GitHub identity changed; restart authorization');
      if (current && current.revoked_at === null)
        throw new ConflictException('GitHub identity is already bound');
      const userId = randomUUID();
      await db.execute('INSERT INTO platform_users (user_id,active) VALUES ($1,1)', [userId]);
      const result = await db.execute(
        'INSERT INTO platform_github_bindings (user_id,github_id,github_login) VALUES ($1,$2,$3) RETURNING sequence',
        [userId, pending.github_id, pending.github_login],
      );
      await this.access.insertSession(
        userId,
        githubSource(Number(result.rows[0].sequence)),
        token!,
        db,
      );
      await db.execute('DELETE FROM platform_github_registrations WHERE browser_hash=$1', [
        tokenHash(token!),
      ]);
      return await this.access.accountForUser(userId, db);
    });
  }
  private async pendingRegistration(
    token: string | undefined,
    db: QueryExecutor = this.storage.executor,
  ) {
    if (!token || !opaqueToken.test(token))
      throw new UnauthorizedException('Registration expired; restart GitHub authorization');
    const pending = (await db.one(
      'SELECT * FROM platform_github_registrations WHERE browser_hash=$1 AND expires_at>$2',
      [tokenHash(token), Date.now()],
    )) as
      | {
          github_id: string;
          github_login: string;
          history_sequence: number;
          history_revoked_at: number | null;
          expires_at: number;
        }
      | undefined;
    if (!pending)
      throw new UnauthorizedException('Registration expired; restart GitHub authorization');
    return pending;
  }
  private async identityHistory(id: string, db: QueryExecutor = this.storage.executor) {
    return await db.one(
      'SELECT sequence,revoked_at FROM platform_github_bindings WHERE github_id=$1 ORDER BY sequence DESC LIMIT 1',
      [id],
    );
  }
  private async start(
    token: string,
    userId: string | null,
    bindingSequence: number,
    purpose: OAuthFlow['purpose'] = userId ? 'bind' : 'login',
    db: QueryExecutor = this.storage.executor,
  ) {
    if (!this.enabled) throw new ServiceUnavailableException('GitHub OAuth is unavailable');
    const now = Date.now();
    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(32).toString('base64url');
    await db.execute('DELETE FROM platform_github_flows WHERE expires_at <= $1', [now]);
    await db.execute('DELETE FROM platform_password_setup_proofs WHERE expires_at <= $1', [now]);
    await db.execute('DELETE FROM platform_github_registrations WHERE expires_at <= $1', [now]);
    await db.execute(
      `
      INSERT INTO platform_github_flows
        (state_hash, browser_hash, user_id, verifier, binding_sequence, expires_at, started_at, purpose)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `,
      [
        tokenHash(state),
        tokenHash(token),
        userId,
        verifier,
        bindingSequence,
        now + flowDuration,
        now,
        purpose,
      ],
    );
    return this.provider.authorize(state, verifier);
  }
  private async deleteBrowserFlows(
    token: string | undefined,
    db: QueryExecutor = this.storage.executor,
  ) {
    if (!token) return;
    await db.execute('DELETE FROM platform_github_registrations WHERE browser_hash = $1', [
      tokenHash(token),
    ]);
    await db.execute('DELETE FROM platform_github_flows WHERE browser_hash = $1', [
      tokenHash(token),
    ]);
  }
  private async latestBindingSequence(userId?: string, db: QueryExecutor = this.storage.executor) {
    const row = userId
      ? await db.one(
          'SELECT MAX(sequence) AS latest FROM platform_github_bindings WHERE user_id = $1',
          [userId],
        )
      : await db.one('SELECT MAX(sequence) AS latest FROM platform_github_bindings', []);
    return Number(row?.latest ?? 0);
  }
  private async bindingForUser(userId: string, db: QueryExecutor = this.storage.executor) {
    return (await db.one(
      'SELECT sequence, github_login FROM platform_github_bindings WHERE user_id = $1 AND revoked_at IS NULL',
      [userId],
    )) as
      | {
          sequence: number;
          github_login: string;
        }
      | undefined;
  }
}
