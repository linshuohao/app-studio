import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Demo owns disposable Runtime sessions; leaving a route must unmount its page.
  cacheComponents: false,
  transpilePackages: [
    '@form-engine/protocol',
    '@form-engine/compiler',
    '@form-engine/runtime',
    '@form-engine/pure-functions',
    '@form-engine/renderer-react',
    '@form-engine/materials-react',
  ],
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
