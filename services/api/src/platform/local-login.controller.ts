import { randomBytes } from 'node:crypto';
import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PlatformAccess, sessionDuration } from './access.js';
import { PlatformDatabase } from './database.js';
import {
  cookieName,
  cookieOptions,
  requireStudioOrigin,
  session,
  studioOrigin,
} from './session-http.js';
const userId = 'local-development-only';
const memberId = 'local-development-only';
const loopback = (host: string | undefined) =>
  ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost', '[::1]'].includes(host ?? '');
export function localLoginEnabled(request: Pick<Request, 'socket' | 'headers'>) {
  try {
    return (
      process.env.NODE_ENV === 'development' &&
      process.env.PLATFORM_LOCAL_LOGIN === 'true' &&
      loopback(process.env.HOST ?? '127.0.0.1') &&
      loopback(request.socket.remoteAddress) &&
      !request.headers.forwarded &&
      (request.headers['x-forwarded-for'] === undefined ||
        (typeof request.headers['x-forwarded-for'] === 'string' &&
          request.headers['x-forwarded-for'].split(',').every((ip) => loopback(ip.trim())))) &&
      loopback(new URL(studioOrigin()).hostname) &&
      loopback(new URL(`http://${request.headers.host}`).hostname) &&
      (!request.headers['x-forwarded-host'] ||
        loopback(new URL(`http://${request.headers['x-forwarded-host']}`).hostname))
    );
  } catch {
    return false;
  }
}
@Controller('api/platform/local-login')
export class LocalLoginController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly storage: PlatformDatabase,
  ) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  async status(
    @Req()
    request: Request,
  ) {
    const db = this.storage.executor;
    if (!localLoginEnabled(request)) return { enabled: false };
    const roles = (
      await db.many('SELECT role FROM platform_member_roles WHERE member_id=$1', [memberId])
    ).map((row) => String(row.role));
    return { enabled: true, username: userId, roles: roles.length ? roles : ['admin'] };
  }
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Req()
    request: Request,
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Res({ passthrough: true })
    response: Response,
  ) {
    if (!localLoginEnabled(request))
      throw new ForbiddenException('Local development login is disabled');
    requireStudioOrigin(origin);
    const token = randomBytes(32).toString('base64url');
    const result = await this.storage.transaction(async (db) => {
      if (!(await db.one('SELECT 1 FROM platform_users WHERE user_id=$1', [userId]))) {
        await db.execute(
          'INSERT INTO platform_spaces(space_id) VALUES ($1) ON CONFLICT (space_id) DO NOTHING',
          ['default'],
        );
        await db.execute('INSERT INTO platform_users(user_id,active) VALUES ($1,1)', [userId]);
        await db.execute(
          'INSERT INTO platform_members(member_id,user_id,space_id,active) VALUES ($1,$2,$3,1)',
          [memberId, userId, 'default'],
        );
        await db.execute('INSERT INTO platform_member_roles(member_id,role) VALUES ($1,$2)', [
          memberId,
          'admin',
        ]);
      }
      await this.access.contextForUser(userId, db);
      return await this.access.insertSession(userId, 'local-development', token, db);
    });
    await this.access.revokeSession(session(cookie));
    response.cookie(cookieName(), token, { ...cookieOptions(), maxAge: sessionDuration });
    return result;
  }
}
