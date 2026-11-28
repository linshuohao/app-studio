import { PREPARED_FORMAT_VERSION } from '@form-engine/compiler';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setImmediate } from 'node:timers/promises';
import { catalogDocumentation } from './catalog-documentation.js';
import { buildIdentity } from './build-identity.js';
import {
  readRetainedCatalogs,
  readWebAssetPolicies,
  WebAssetCatalog,
} from './web-asset-catalog.js';
import { checkAssetBindings } from './version-web-bindings.js';
import { compileWebConfig, webCatalog, webTarget } from './web-check.js';

const identity = (specifier: string, id: string) =>
  buildIdentity(fileURLToPath(import.meta.resolve(specifier)), id);

function compilerBuildIdentity() {
  const compilerFile = fileURLToPath(import.meta.resolve('@form-engine/compiler/package.json'));
  const artifacts: string[] = [];
  const visited = new Set<string>();
  const include = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as {
      name: string;
      dependencies?: Record<string, string>;
    };
    const directories =
      manifest.name === '@form-engine/protocol'
        ? ['dist', 'schemas']
        : manifest.name === '@form-engine/compiler'
          ? ['dist']
          : ['.'];
    artifacts.push(manifest.name + ':' + buildIdentity(file, manifest.name, directories).digest);
    const resolve = createRequire(file).resolve;
    for (const dependency of Object.keys(manifest.dependencies ?? {}).sort()) {
      const packageFile =
        dependency === '@noble/hashes'
          ? join(dirname(resolve('@noble/hashes/sha256')), 'package.json')
          : resolve(dependency + '/package.json');
      include(packageFile);
    }
  };
  include(compilerFile);
  return createHash('sha256')
    .update(JSON.stringify([process.versions.node, ...artifacts]))
    .digest('hex');
}

function releaseInputs() {
  const material = identity('@form-engine/materials-react/package.json', 'materials-react');
  const functions = identity('@form-engine/pure-functions/package.json', 'pure-functions');
  return {
    compiler: compilerBuildIdentity(),
    catalog: webCatalog(`web:${material.digest}:${functions.digest}`, material, functions),
  };
}

export type ReleaseBuildInput = ReturnType<typeof releaseInputs> & {
  target: ReturnType<typeof webTarget> & { preparedFormatVersion: string };
  selections?: Parameters<typeof checkAssetBindings>[3];
  requestNotes?: Record<string, Record<string, string>>;
  schemaResources: NonNullable<Parameters<typeof compileWebConfig>[1]['schemaResources']>;
};

@Injectable()
export class ReleaseBuild {
  // Snapshot the installed artifacts at API startup. A new build runs in a new API process.
  private readonly installed = releaseInputs();
  readonly webAssetVersionSelection = process.env.PLATFORM_WEB_ASSET_VERSION_SELECTION === 'true';
  readonly assets = new WebAssetCatalog(
    this.installed.catalog,
    readRetainedCatalogs(process.env.PLATFORM_RETAINED_WEB_CATALOGS_FILE),
    this.webAssetVersionSelection
      ? readWebAssetPolicies(process.env.PLATFORM_WEB_ASSET_POLICIES_FILE)
      : [],
  );

  capture(
    target: ReturnType<typeof webTarget>,
    catalog = this.assets.recommended,
    selections?: Parameters<typeof checkAssetBindings>[3],
  ): ReleaseBuildInput {
    return {
      ...this.installed,
      catalog,
      selections,
      requestNotes: Object.fromEntries(
        Object.entries(catalog.materials).flatMap(([id, { manifest }]) => {
          const doc = catalogDocumentation[id];
          if (doc?.version !== manifest.version) return [];
          return Object.keys(manifest.requests ?? {}).flatMap((local) => {
            const prefix = '/requests/' + local + '/';
            const notes = Object.entries(doc.annotations ?? {}).filter(([key]) =>
              key.startsWith(prefix),
            );
            return notes.length
              ? [
                  [
                    `material:${encodeURIComponent(id)}:request:${encodeURIComponent(local)}`,
                    Object.fromEntries(
                      notes.map(([key, value]) => [key.slice(prefix.length), value]),
                    ),
                  ],
                ]
              : [];
          });
        }),
      ),
      target: { ...target, preparedFormatVersion: PREPARED_FORMAT_VERSION },
      schemaResources: {},
    };
  }

  async compile(text: string, input: ReleaseBuildInput) {
    await setImmediate();
    if (input.compiler !== this.installed.compiler)
      throw new ServiceUnavailableException('Pinned Compiler build unavailable');
    if (input.selections)
      return checkAssetBindings(text, input.catalog, input.target, input.selections);
    return compileWebConfig(text, {
      catalog: input.catalog,
      target: input.target,
      schemaResources: input.schemaResources,
    });
  }
}
