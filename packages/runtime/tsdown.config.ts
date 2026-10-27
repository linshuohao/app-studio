import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts', 'src/devtools/index.ts'],
  format: 'esm',
  platform: 'neutral',
  dts: true,
  define: { __FORM_ENGINE_DEVTOOLS_ENABLED__: 'false' },
  sourcemap: true,
  clean: !process.argv.includes('--watch'),
  deps: { neverBundle: [/^@form-engine\//, /^react(?:-dom)?(?:\/.*)?$/] },
});
