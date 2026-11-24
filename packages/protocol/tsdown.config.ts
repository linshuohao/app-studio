import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/definition/index.ts',
    'src/capability/index.ts',
    'src/prepared/index.ts',
    'src/internal/json.ts',
    'src/internal/schema.ts',
    'src/internal/prepared.ts',
  ],
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  clean: !process.argv.includes('--watch'),
  deps: { neverBundle: [/^@form-engine\//, /^react(?:-dom)?(?:\/.*)?$/] },
});
