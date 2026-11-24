import { spawn, spawnSync } from 'node:child_process';
import { createTestDatabase } from '../../../services/api/tools/test-database.mjs';
import { fileURLToPath } from 'node:url';

const database = await createTestDatabase();
const cwd = fileURLToPath(new URL('../../../services/api/', import.meta.url));
const githubProvider = fileURLToPath(new URL('./github-provider.mjs', import.meta.url));
const origin = process.env.PLATFORM_STUDIO_ORIGIN || 'http://127.0.0.1:3200';
const env = {
  ...process.env,
  HOST: '127.0.0.1',
  API_PORT: process.env.STUDIO_TEST_API_PORT || '3001',
  PLATFORM_STUDIO_ORIGIN: origin,
  PLATFORM_GITHUB_CLIENT_ID: 'studio-test-client',
  PLATFORM_GITHUB_CLIENT_SECRET: 'studio-test-secret',
  PLATFORM_GITHUB_CALLBACK_URL: origin + '/api/platform/github/callback',
  PLATFORM_DATABASE_URL: database.connectionString,
};

try {
  const bootstrap = spawnSync(process.execPath, ['dist/platform/bootstrap.js', 'studio-test'], {
    cwd,
    env,
    input: 'local-browser-test-password\n',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (bootstrap.status !== 0) throw new Error('Studio test database initialization failed');
  const child = spawn(process.execPath, ['--import', githubProvider, 'dist/main.js'], {
    cwd,
    env,
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });
} finally {
  await database.dispose();
}
