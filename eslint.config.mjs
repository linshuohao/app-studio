import { defineConfig, globalIgnores } from 'eslint/config';
import base from './tools/config/eslint.mjs';
import next from './apps/playground/eslint.config.mjs';
import prettier from 'eslint-config-prettier';
export default defineConfig([
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/next-env.d.ts',
    'docs/**',
    '.agents/**',
    'tools/docs/**',
    'coverage/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: [
      'packages/**/*.{ts,tsx,js,mjs,cjs}',
      'services/**/*.{ts,tsx,js,mjs,cjs}',
      'tools/engineering/**/*.{mjs,cjs}',
      'tools/config/**/*.{ts,mjs}',
      'tests/**/*.ts',
      '*.{ts,mjs,cjs}',
    ],
    extends: base,
  },
  {
    files: ['apps/playground/**/*.{ts,tsx,mjs}'],
    extends: next,
    settings: { next: { rootDir: 'apps/playground/' } },
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['@form-engine/*/src/**', '**/packages/*/src/**'] },
      ],
    },
  },
  prettier,
]);
