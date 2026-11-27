import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/manifests.ts', 'src/web-asset-compatibility.ts'],
  copy: ['src/styles.css'],
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  // The static contract entry and shared contract chunks must stay server-consumable.
  banner: ({ fileName }) => (fileName === 'index.js' ? '"use client";' : undefined),
  clean: !process.argv.includes('--watch'),
  deps: { neverBundle: [/^@form-engine\//, /^react(?:-dom)?(?:\/.*)?$/] },
});
