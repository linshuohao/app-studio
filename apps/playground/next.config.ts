import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@form-engine/protocol',
    '@form-engine/compiler',
    '@form-engine/runtime',
    '@form-engine/pure-functions',
    '@form-engine/renderer-react',
    '@form-engine/materials-react',
  ],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
