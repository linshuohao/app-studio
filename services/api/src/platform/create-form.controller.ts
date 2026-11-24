import {
  BadRequestException,
  Body,
  Logger,
  Controller,
  Headers,
  HttpCode,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { catalogDocumentation } from './catalog-documentation.js';
import { isUtf8ConfigText, maxConfigTextBytes } from './forms.js';
import { ReleaseBuild } from './release-build.js';
import { checkEnvironment, previewInputs, serviceToken } from './create-form-agent.js';

function requireAgent(token?: string) {
  const expected = Buffer.from(serviceToken());
  const actual = Buffer.from(token ?? '');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw new UnauthorizedException();
}

@Controller()
export class CreateFormController {
  constructor(private readonly builds: ReleaseBuild) {}

  private requireEnvironment(expected?: string) {
    const current = checkEnvironment(this.builds);
    if (expected !== undefined && expected !== current)
      throw new ServiceUnavailableException('Requested compiler environment unavailable');
    return current;
  }

  @Post('internal/agent-tools/catalog')
  @HttpCode(200)
  catalog(
    @Headers('x-agent-service-token') token: string,
    @Body() body: { kind: string; query: string; check_environment?: string },
    @Headers('x-trace-id') traceId?: string,
  ) {
    requireAgent(token);
    this.requireEnvironment(body.check_environment);
    if (traceId) Logger.log({ traceId, kind: body.kind }, 'CreateFormCatalog');
    const { catalog } = previewInputs(this.builds);
    if (body.kind === 'host')
      return {
        ...catalog.host,
        validatorUsage: {
          'travel.checkPassportDuplicates': {
            scope: 'root',
            watch: [
              { source: 'data', path: '/applicant/passportNumber' },
              { source: 'data', path: '/insureds' },
            ],
            target: { source: 'data', path: '/applicant/passportNumber' },
            description:
              'insureds[0] is the applicant card and uses /applicant/passportNumber as its only passport field. Other insureds use /insureds/{index}/passportNumber. Compares nonblank numbers after trim and uppercase and emits an issue at every conflicting person’s passport field.',
          },
        },
      };
    const entries =
      body.kind === 'material'
        ? catalog.materials
        : body.kind === 'pure_function'
          ? catalog.pureFunctions
          : {};
    const words = String(body.query ?? '')
      .toLowerCase()
      .split(/[^\w.-]+/)
      .filter(Boolean);
    const ids = Object.keys(entries);
    const matches = ids.filter((id) => words.includes(id.toLowerCase()));
    if (!matches.length) return ids;
    return matches.map((id) => {
      const manifest = entries[id]!.manifest;
      const doc = body.kind === 'pure_function' ? catalogDocumentation[id] : undefined;
      return doc?.version === manifest.version
        ? { ...manifest, description: doc.description }
        : manifest;
    });
  }

  @Post('internal/agent-tools/check')
  @HttpCode(200)
  async check(
    @Headers('x-agent-service-token') token: string,
    @Body() body: { candidate_text: string; check_environment?: string },
    @Headers('x-trace-id') traceId?: string,
  ) {
    requireAgent(token);
    const text = body?.candidate_text;
    if (!isUtf8ConfigText(text)) throw new BadRequestException('Config must be UTF-8 text');
    const environment = this.requireEnvironment(body.check_environment);
    const bytes = Buffer.byteLength(text);
    const checked =
      bytes <= maxConfigTextBytes
        ? await this.builds.compile(text, previewInputs(this.builds))
        : {
            success: false as const,
            diagnostics: [
              {
                code: 'CONFIG_TEXT_TOO_LARGE',
                severity: 'error' as const,
                sourcePointer: '',
                message: `候选配置为 ${bytes} 字节，超过 UTF-8 上限 ${maxConfigTextBytes} 字节。请在保留已确认需求的前提下缩减配置，再提交检查。`,
              },
            ],
          };
    const digest = 'sha256:' + createHash('sha256').update(text).digest('hex');
    Logger.log(
      {
        traceId,
        candidateDigest: digest,
        success: checked.success,
        diagnostics: checked.diagnostics.map((d) => d.code),
      },
      'CreateFormCompiler',
    );
    return {
      check_id: randomUUID(),
      check_environment: environment,
      candidate_digest: digest,
      success: checked.success,
      diagnostics: checked.diagnostics,
      host_requirements: checked.success ? checked.prepared.hostRequirements : {},
    };
  }
}
