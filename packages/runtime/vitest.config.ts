import { fsModuleCachePath } from '../../tools/config/vitest-cache.js';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { fsModuleCachePath, include: ['tests/**/*.test.ts'], environment: 'node' },
});
