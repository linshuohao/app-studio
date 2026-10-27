import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  transpilePackages: [
    '@form-engine/protocol',
    '@form-engine/compiler',
    '@form-engine/runtime',
    '@form-engine/pure-functions',
    '@form-engine/renderer-react',
  ],
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.ts': {
        loaders: [
          fileURLToPath(
            new URL('../../tools/engineering/source-extension-loader.cjs', import.meta.url),
          ),
        ],
      },
      '*.tsx': {
        loaders: [
          fileURLToPath(
            new URL('../../tools/engineering/source-extension-loader.cjs', import.meta.url),
          ),
        ],
      },
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
