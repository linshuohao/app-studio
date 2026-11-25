import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
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
    rules: {
      '*.ts': { loaders: [sourceLoader] },
      '*.tsx': { loaders: [sourceLoader] },
    },
  },
  ...(process.env.STUDIO_DIST_DIR && { distDir: process.env.STUDIO_DIST_DIR }),
  logging: { incomingRequests: { ignore: [/^\/api\/platform\/github\/callback(?:\?|$)/] } },
  env: {
    RELEASE_MATERIAL_DIGEST: material.digest,
    RELEASE_FUNCTION_DIGEST: functions.digest,
  },
  async rewrites() {
    const api = new URL(process.env.PLATFORM_API_URL || 'http://127.0.0.1:3001');
    return [{ source: '/api/platform/:path*', destination: `${api.origin}/api/platform/:path*` }];
  },
};

export default config;
