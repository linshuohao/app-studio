import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIdentity } from '../../services/api/src/platform/build-identity';

const resolvePackage = createRequire(resolve('package.json')).resolve;
const material = buildIdentity(
  resolvePackage('@form-engine/materials-react/package.json'),
  'materials-react',
);
const functions = buildIdentity(
  resolvePackage('@form-engine/pure-functions/package.json'),
  'pure-functions',
);

const sourceLoader = fileURLToPath(
  new URL('../../tools/engineering/source-extension-loader.cjs', import.meta.url),
);
const retainedSpecifier = '@studio-retained/web-capabilities';
const studioRoot = fileURLToPath(new URL('.', import.meta.url));
const retainedModule = process.env.STUDIO_RETAINED_WEB_CAPABILITIES_MODULE;
const retainedPath = retainedModule ? resolve(studioRoot, retainedModule) : undefined;
if (retainedPath) {
  const pathFromStudio = relative(studioRoot, retainedPath);
  if (!pathFromStudio || pathFromStudio.startsWith('..') || isAbsolute(pathFromStudio))
    throw new Error('The retained Web capability module must be in the Studio build workspace');
}

const config: NextConfig = {
  devIndicators: { position: 'bottom-right' },
  experimental: { proxyTimeout: 615_000 },
  transpilePackages: [
    '@form-engine/protocol',
    '@form-engine/compiler',
    '@form-engine/runtime',
    '@form-engine/pure-functions',
    '@form-engine/renderer-react',
    '@form-engine/materials-react',
    '@form-engine/studio-design-components',
  ],
  turbopack: {
    ...(retainedPath && {
      resolveAlias: { [retainedSpecifier]: './' + relative(studioRoot, retainedPath) },
    }),
    rules: {
      '*.ts': { loaders: [sourceLoader] },
      '*.tsx': { loaders: [sourceLoader] },
    },
  },
  ...(retainedPath && {
    webpack(config) {
      config.resolve.alias[retainedSpecifier] = retainedPath;
      return config;
    },
  }),
  ...(process.env.STUDIO_DIST_DIR && { distDir: process.env.STUDIO_DIST_DIR }),
  logging: { incomingRequests: { ignore: [/^\/api\/platform\/github\/callback(?:\?|$)/] } },
  env: {
    RELEASE_MATERIAL_DIGEST: material.digest,
    RELEASE_FUNCTION_DIGEST: functions.digest,
  },
  async rewrites() {
    const api = new URL(process.env.PLATFORM_API_URL || 'http://127.0.0.1:3001');
    const apiRoutes = [
      { source: '/api/platform/:path*', destination: `${api.origin}/api/platform/:path*` },
    ];
    const releaseId = process.env.STUDIO_HISTORICAL_HOST_RELEASE_ID ?? '';
    const port = Number(process.env.STUDIO_HISTORICAL_HOST_PORT);
    if (
      process.env.NODE_ENV !== 'development' ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(releaseId) ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      port === 3200
    )
      return apiRoutes;

    // A historical build with its own stylesheet serves this release on the original Studio URL.
    const historical = `http://127.0.0.1:${port}`;
    return {
      beforeFiles: [
        {
          source: '/host',
          has: [{ type: 'query', key: 'releaseId', value: releaseId }],
          destination: `${historical}/host`,
        },
        { source: '/__studio-historical-host/:path*', destination: `${historical}/:path*` },
      ],
      afterFiles: apiRoutes,
    };
  },
};

export default config;
