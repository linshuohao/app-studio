import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { PlatformDrafts, type DraftAction, type DraftPreview } from './form-drafts.js';
import { requireStudioOrigin, session } from './session-http.js';
import { checkWebConfig, type ConfigInput } from './web-check.js';
import { configText } from './forms.js';

@Controller('api/platform/form-drafts')
export class FormDraftsController {
  constructor(private readonly drafts: PlatformDrafts) {}
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@Headers('cookie') cookie: string) {
    return this.drafts.list(session(cookie));
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(@Headers('cookie') cookie: string, @Param('id') id: string) {
    return this.drafts.get(session(cookie), id);
  }
  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
  ) {
    requireStudioOrigin(origin);
    await this.drafts.remove(session(cookie), id);
  }
  @Patch(':id')
  edit(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Body() body: Parameters<PlatformDrafts['edit']>[2],
  ) {
    requireStudioOrigin(origin);
    return this.drafts.edit(session(cookie), id, body);
  }
  @Post([':id/editor/check', ':id/editor/preview'])
  async inspect(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Body() body: ConfigInput,
  ) {
    requireStudioOrigin(origin);
    await this.drafts.get(session(cookie), id);
    return checkWebConfig(configText(body?.text), body?.profile, true);
  }
  @Post(':id/preview')
  preview(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Body() body: DraftAction,
  ): Promise<DraftPreview> {
    requireStudioOrigin(origin);
    return this.drafts.preview(session(cookie), id, body);
  }
  @Post(':id/save')
  save(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Body() body: DraftAction,
  ) {
    requireStudioOrigin(origin);
    return this.drafts.save(session(cookie), id, body);
  }
}
