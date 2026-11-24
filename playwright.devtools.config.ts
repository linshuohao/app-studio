import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/devtools',
  workers: 1,
  timeout: 60_000,
  retries: 0,
  reporter: 'list',
  webServer: {
    command: 'pnpm --filter @form-engine/playground dev --port 3217',
    url: 'http://127.0.0.1:3217',
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === '1',
    timeout: 60_000,
  },
});
