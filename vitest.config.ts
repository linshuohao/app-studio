import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { conditions: ['development'] },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    sequence: { seed: 42 },
  },
});
