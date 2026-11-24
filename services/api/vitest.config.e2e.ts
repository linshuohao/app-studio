import { fsModuleCachePath } from '../../tools/config/vitest-cache.js';
import { defineConfig } from 'vitest/config';
import config from './vitest.config.js';
export default defineConfig({
  ...config,
  test: {
    setupFiles: ['./test/postgres.setup.ts'],
    hookTimeout: 30000,
    testTimeout: 30000,
    fsModuleCachePath,
    ...config.test,
    include: ['test/**/*.e2e-spec.ts'],
  },
});
