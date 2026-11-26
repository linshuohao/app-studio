import { Body, Controller, Get, Header, Headers, HttpCode, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PlatformAccess, sessionDuration } from './access.js';
import { GitHubAccess } from './github-access.js';
import { PlatformForms } from './forms.js';
import { PlatformReleases } from './releases.js';
import { cookieName, cookieOptions, requireStudioOrigin, session } from './session-http.js';
import { webTarget, type ConfigCheck, type ConfigInput } from './web-check.js';
import { ReleaseBuild } from './release-build.js';
import {
  captureAssetBindings,
  checkAssetBindings,
  describeAssetBindings,
} from './version-web-bindings.js';
@Controller('api/platform')
export class PlatformController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly forms: PlatformForms,
    private readonly releases: PlatformReleases,
    private readonly github: GitHubAccess,
    private readonly builds: ReleaseBuild,
  ) {}
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async login(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Body()
    input:
      | {
          username?: unknown;
          password?: unknown;
        }
      | undefined,
    @Res({ passthrough: true })
    response: Response,
  ) {
    requireStudioOrigin(origin);
    const { token, context } = await this.access.login(input?.username, input?.password);
    await this.access.revokeSession(session(cookie));
    response.cookie(cookieName(), token, { ...cookieOptions(), maxAge: sessionDuration });
    return context;
  }
  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Res({ passthrough: true })
    response: Response,
  ) {
    requireStudioOrigin(origin);
    await this.access.revokeSession(session(cookie));
    response.clearCookie(cookieName(), cookieOptions());
  }
  @Post('password')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async changePassword(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Body()
    input:
      | {
          currentPassword?: unknown;
          password?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.access.changePassword(
      session(cookie),
      input?.currentPassword,
      input?.password,
    );
  }
  @Get('account/password/setup')
  @Header('Cache-Control', 'no-store')
  async passwordSetupStatus(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    return await this.github.passwordSetupStatus(session(cookie));
  }
  @Post('account/password/setup')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async setupPassword(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Body()
    input:
      | {
          username?: unknown;
          password?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.github.setupPassword(session(cookie), input?.username, input?.password);
  }
  @Get('account')
  @Header('Cache-Control', 'no-store')
  async account(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    return await this.access.account(session(cookie));
  }
  @Get('access')
  @Header('Cache-Control', 'no-store')
  async context(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    return await this.access.authenticate(session(cookie));
  }
  @Get('forms')
  @Header('Cache-Control', 'no-store')
  async list(
    @Headers('cookie')
    cookie: string | undefined,
  ) {
    return await this.forms.list(session(cookie));
  }
  @Post('forms')
  @Header('Cache-Control', 'no-store')
  async create(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('idempotency-key')
    key: string | undefined,
    @Body()
    input:
      | {
          name?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.forms.create(session(cookie), key, input?.name);
  }
  @Get('forms/:formId')
  @Header('Cache-Control', 'no-store')
  async open(
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
  ) {
    return await this.forms.open(session(cookie), formId);
  }
  @Get('forms/:formId/work')
  @Header('Cache-Control', 'no-store')
  works(@Headers('cookie') cookie: string, @Param('formId') id: string) {
    return this.forms.works(session(cookie), id);
  }
  @Get('forms/:formId/work/:work')
  @Header('Cache-Control', 'no-store')
  working(
    @Headers('cookie') cookie: string,
    @Param('formId') id: string,
    @Param('work') work: string,
  ) {
    return this.forms.works(session(cookie), id, work);
  }
  @Post('forms/:formId/work')
  createWork(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Headers('idempotency-key') key: string,
    @Param('formId') id: string,
    @Body() input: { name?: unknown; source?: unknown; text?: unknown },
  ) {
    requireStudioOrigin(origin);
    return this.forms.newWork(session(cookie), key, id, input);
  }
  @Post('forms/:formId/versions')
  @Header('Cache-Control', 'no-store')
  async save(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('idempotency-key')
    key: string | undefined,
    @Param('formId')
    formId: string,
    @Body()
    input:
      | {
          text?: unknown;
          workId?: string;
          assetChoices?: unknown;
          inspectedCatalog?: unknown;
          basedOnVersionId?: unknown;
          note?: unknown;
          name?: unknown;
        }
      | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.forms.save(
      session(cookie),
      key,
      formId,
      input?.text,
      input?.basedOnVersionId,
      input?.note,
      input?.name,
      input?.workId,
      input?.assetChoices,
      input?.inspectedCatalog,
    );
  }
  @Get('forms/:formId/versions')
  @Header('Cache-Control', 'no-store')
  async history(
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
  ) {
    return await this.forms.history(session(cookie), formId);
  }
  @Get('forms/:formId/versions/:versionId')
  @Header('Cache-Control', 'no-store')
  async version(
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
    @Param('versionId')
    versionId: string,
  ) {
    return await this.forms.detail(session(cookie), formId, versionId);
  }
  @Get('forms/:formId/versions/:versionId/asset-binding-evidence')
  @Header('Cache-Control', 'no-store')
  assetBindingEvidence(
    @Headers('cookie') cookie: string | undefined,
    @Param('formId') formId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.forms.assetBindingEvidence(session(cookie), formId, versionId);
  }
  @Post('forms/:formId/copies')
  @Header('Cache-Control', 'no-store')
  async copy(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('idempotency-key')
    key: string | undefined,
    @Param('formId')
    formId: string,
    @Body()
    input: Parameters<PlatformForms['copy']>[3] | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.forms.copy(session(cookie), key, formId, input ?? {});
  }
  @Post('forms/:formId/metadata')
  @Header('Cache-Control', 'no-store')
  async metadata(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
    @Body()
    input: Parameters<PlatformForms['updateMetadata']>[2] | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.forms.updateMetadata(session(cookie), formId, input ?? {});
  }
  @Post('forms/:formId/archive')
  @Header('Cache-Control', 'no-store')
  async archive(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
  ) {
    requireStudioOrigin(origin);
    return await this.forms.setArchived(session(cookie), formId, true);
  }
  @Post('forms/:formId/restore')
  @Header('Cache-Control', 'no-store')
  async restore(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
  ) {
    requireStudioOrigin(origin);
    return await this.forms.setArchived(session(cookie), formId, false);
  }
  @Post('forms/:formId/releases')
  @Header('Cache-Control', 'no-store')
  async publish(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Headers('idempotency-key')
    key: string | undefined,
    @Param('formId')
    formId: string,
    @Body()
    input: Parameters<PlatformReleases['publish']>[3] | undefined,
  ) {
    requireStudioOrigin(origin);
    return await this.releases.publish(session(cookie), formId, key, input ?? {});
  }
  @Get('forms/:formId/releases')
  @Header('Cache-Control', 'no-store')
  async releasesForForm(
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
  ) {
    return await this.releases.list(session(cookie), formId);
  }
  @Get('releases/:releaseId')
  @Header('Access-Control-Allow-Origin', '*')
  @Header('Cache-Control', 'no-store')
  async delivery(
    @Param('releaseId')
    releaseId: string,
  ) {
    return await this.releases.delivery(releaseId);
  }
  @Post('forms/:formId/asset-bindings')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async assetBindings(
    @Headers('origin') origin: string | undefined,
    @Headers('cookie') cookie: string | undefined,
    @Param('formId') formId: string,
    @Body() input: ConfigInput | undefined,
  ) {
    requireStudioOrigin(origin);
    const { text, bindings } = await this.forms.authoringAssetInput(
      session(cookie),
      formId,
      input ?? {},
      'preview',
    );
    return describeAssetBindings(this.builds.assets, text, bindings);
  }

  @Post('forms/:formId/check')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async check(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
    @Body()
    input: (ConfigInput & { simulateTravelHost?: boolean }) | undefined,
  ) {
    requireStudioOrigin(origin);
    const { text, bindings } = await this.forms.authoringAssetInput(
      session(cookie),
      formId,
      input ?? {},
      'check',
    );
    const target = webTarget(input?.profile);
    const { catalog, selections } = captureAssetBindings(
      this.builds.assets,
      text,
      target.profile,
      bindings,
    );
    const checked = checkAssetBindings(
      text,
      catalog,
      target,
      selections,
      input?.simulateTravelHost === true,
    );
    if (!checked.success) return { ...checked, recommendedCatalog: this.builds.assets.recommended.id };
    return {
      success: true,
      diagnostics: checked.diagnostics,
      catalogId: checked.catalogId,
      target: checked.target,
      recommendedCatalog: this.builds.assets.recommended.id,
    };
  }
  @Post('forms/:formId/preview')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async preview(
    @Headers('origin')
    origin: string | undefined,
    @Headers('cookie')
    cookie: string | undefined,
    @Param('formId')
    formId: string,
    @Body()
    input: (ConfigInput & { simulateTravelHost?: boolean }) | undefined,
  ): Promise<ConfigCheck & { recommendedCatalog: string }> {
    requireStudioOrigin(origin);
    const { text, bindings } = await this.forms.authoringAssetInput(
      session(cookie),
      formId,
      input ?? {},
      'preview',
    );
    const target = webTarget(input?.profile);
    const { catalog, selections } = captureAssetBindings(
      this.builds.assets,
      text,
      target.profile,
      bindings,
    );
    return {
      ...checkAssetBindings(text, catalog, target, selections, input?.simulateTravelHost === true),
      recommendedCatalog: this.builds.assets.recommended.id,
    };
  }
}
