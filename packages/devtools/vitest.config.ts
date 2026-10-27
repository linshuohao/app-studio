import { fsModuleCachePath } from '../../tools/config/vitest-cache.js';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    fsModuleCachePath,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
  },
});
