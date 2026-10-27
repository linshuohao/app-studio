import { fsModuleCachePath } from '../../tools/config/vitest-cache.js';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    fsModuleCachePath,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
  },
});
