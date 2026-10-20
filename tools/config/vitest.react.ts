import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['../../tools/config/testing-library.ts'],
    restoreMocks: true,
  },
});
