import { fsModuleCachePath } from './tools/config/vitest-cache.js';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    fsModuleCachePath,
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    sequence: { seed: 42 },
  },
});
