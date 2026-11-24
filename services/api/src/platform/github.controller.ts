import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { sessionDuration } from './access.js';
import { GitHubAccess } from './github-access.js';
import { cookieName, cookieOptions, requireStudioOrigin, session } from './session-http.js';
@Controller('api/platform/github')
export class GitHubController {
  constructor(private readonly github: GitHubAccess) {}
  @Get('enabled')
  @Header('Cache-Control', 'no-store')
  enabled() {
    return { enabled: this.github.enabled };
  }
  @Get('binding')
  @Header('Cache-Control', 'no-store')
  async binding(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    return await this.github.status(session(cookie));
  }
  @Post('login')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async login(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Res({ passthrough: true })
    response: Response,
    @Req()
    request: Request,
  ) {
    requireStudioOrigin(origin);
    const { token, url } = await this.github.startLogin(session(cookie), request.ip);
    response.cookie(cookieName(), token, { ...cookieOptions(), maxAge: sessionDuration });
    return { url };
  }
  @Get('registration')
  @Header('Cache-Control', 'no-store')
  async registration(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    return await this.github.registration(session(cookie));
  }
  @Post('register')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async register(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.github.register(session(cookie));
  }
  @Post('password-setup')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async passwordSetup(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.github.startPasswordSetup(session(cookie));
  }
  @Post('bind')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async bind(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Body()
    body:
      | {
          password?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return { url: await this.github.startBinding(session(cookie), body?.password) };
  }
  @Post('unbind')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  async unbind(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Body()
    body:
      | {
          password?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    await this.github.unbind(session(cookie), body?.password);
  }
  @Get('callback')
  @Header('Cache-Control', 'no-store')
  @Header('Referrer-Policy', 'no-referrer')
  async callback(
    @Headers('cookie')
    cookie: string | undefined,
    @Query('state')
    state: unknown,
    @Query('code')
    code: unknown,
    @Query('error')
    error: unknown,
    @Res()
    response: Response,
  ) {
    const result = await this.github.complete(session(cookie), state, code, error);
    response.redirect(303, '/?github=' + result);
  }
}
