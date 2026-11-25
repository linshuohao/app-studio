import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    channel: process.env.STUDIO_TEST_BROWSER_CHANNEL || 'chromium',
  },
});
