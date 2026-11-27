import { catalogDocumentation } from './catalog-documentation.js';
import { materialPreview, materialPreviewVariants } from './material-previews.js';
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { PlatformAccess } from './access.js';
import { ReleaseBuild } from './release-build.js';
import { session } from './session-http.js';
import type { WebAssetKind } from './web-asset-catalog.js';
@Controller('api/platform/catalog')
export class CatalogController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly build: ReleaseBuild,
  ) {}
  private kind(kind: string): WebAssetKind {
    if (kind === 'materials') return 'materials';
    if (kind === 'functions') return 'pureFunctions';
    throw new NotFoundException('Unknown catalog');
  }
  @Get(':kind')
  @Header('Cache-Control', 'no-store')
  async list(
    @Headers('cookie')
    cookie: string | undefined,
    @Param('kind')
    kind: string,
    @Query('q')
    q?: unknown,
    @Query('allVersions') allVersions?: unknown,
  ) {
    await this.access.authenticate(session(cookie), 'form:view');
    if (allVersions !== undefined && allVersions !== 'true')
      throw new BadRequestException('Invalid version filter');
    const entries = this.build.assets.entries(this.kind(kind), allVersions === 'true');
    if (q !== undefined && (typeof q !== 'string' || q.length > 200))
      throw new BadRequestException('Invalid search query');
    const query = ((q ?? '') as string).trim().toLowerCase();
    return entries
      .map(({ manifest, artifact }) => {
        const candidate = Object.hasOwn(catalogDocumentation, manifest.id)
          ? catalogDocumentation[manifest.id]
          : undefined;
        const doc = candidate?.version === manifest.version ? candidate : undefined;
        const description = doc?.description ?? '';
        return {
          id: manifest.id,
          version: manifest.version,
          artifact,
          title: doc?.title ?? (description.split('\n')[0] ?? '').replace(/^#+\s*/, ''),
          summary: doc?.summary,
          category: doc?.category ?? '未分类',
          implementation: doc?.implementation ?? '未标注',
          description,
        };
      })
      .filter((row) =>
        [row.id, row.title, row.description, row.summary, row.category, row.implementation]
          .join(' ')
          .toLowerCase()
          .includes(query),
      );
  }
  @Get(':kind/:id')
  @Header('Cache-Control', 'no-store')
  async detail(
    @Headers('cookie')
    cookie: string | undefined,
    @Param('kind')
    kind: string,
    @Param('id')
    id: string,
    @Query('version')
    version?: unknown,
    @Query('artifactDigest') artifactDigest?: unknown,
  ) {
    await this.access.authenticate(session(cookie), 'form:view');
    if (
      version !== undefined &&
      (typeof version !== 'string' || !version.length || version.length > 200)
    )
      throw new BadRequestException('Invalid version');
    if (
      artifactDigest !== undefined &&
      (typeof artifactDigest !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(artifactDigest))
    )
      throw new BadRequestException('Invalid artifact digest');
    const assetKind = this.kind(kind);
    const entry = this.build.assets.find(assetKind, id, version, artifactDigest);
    if (!entry) throw new NotFoundException('Unknown asset version');
    const documentation = Object.hasOwn(catalogDocumentation, entry.manifest.id)
      ? catalogDocumentation[entry.manifest.id]
      : undefined;
    const preview =
      kind === 'materials' && this.build.assets.isInstalled(assetKind, entry)
        ? materialPreview(id)
        : undefined;
    return {
      ...entry,
      documentation: documentation?.version === entry.manifest.version ? documentation : null,
      ...(preview &&
        preview.prepared.capabilityLock.materials[id]?.version === entry.manifest.version && {
          preview,
          previewVariants: materialPreviewVariants(id),
        }),
    };
  }
}
