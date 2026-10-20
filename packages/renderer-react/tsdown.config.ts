import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/engineering.tsx'],
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  banner: '"use client";',
  clean: !process.argv.includes('--watch'),
  deps: { neverBundle: [/^@form-engine\//, /^react(?:-dom)?(?:\/.*)?$/] },
});
