import { defineConfig, devices } from '@playwright/test';

const studioPort = process.env.STUDIO_TEST_PORT || '3200';
const apiPort = process.env.STUDIO_TEST_API_PORT || '3001';
const studioOrigin = 'http://127.0.0.1:' + studioPort;

export default defineConfig({
  testDir: './tests',
  workers: 1,
  use: { baseURL: studioOrigin, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: process.env.STUDIO_TEST_BROWSER_CHANNEL || 'chromium',
      },
    },
  ],
  webServer: [
    {
      command: 'node tests/start-api.mjs',
      url: 'http://127.0.0.1:' + apiPort,
      env: { STUDIO_TEST_API_PORT: apiPort, PLATFORM_STUDIO_ORIGIN: studioOrigin },
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'pnpm exec next start --hostname 127.0.0.1 --port ' + studioPort,
      url: studioOrigin,
      env: { PLATFORM_API_URL: 'http://127.0.0.1:' + apiPort },
      reuseExistingServer: false,
    },
  ],
});
