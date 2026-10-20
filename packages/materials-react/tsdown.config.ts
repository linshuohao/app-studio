import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/engineering.tsx'],
  format: 'esm',
  platform: 'neutral',
  dts: true,
  copy: ['src/styles.css'],
  sourcemap: true,
  banner: '"use client";',
  clean: !process.argv.includes('--watch'),
  deps: { neverBundle: [/^@form-engine\//, /^react(?:-dom)?(?:\/.*)?$/] },
});
