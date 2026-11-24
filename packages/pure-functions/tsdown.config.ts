import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/manifests.ts'],
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  clean: !process.argv.includes('--watch'),
  deps: { neverBundle: [/^@form-engine\//, /^react(?:-dom)?(?:\/.*)?$/] },
});
