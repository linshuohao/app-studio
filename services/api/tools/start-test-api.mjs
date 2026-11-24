import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from './test-database.mjs';
const database = await createTestDatabase();
try {
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL('../dist/main.js', import.meta.url))],
    {
      env: { ...process.env, PLATFORM_DATABASE_URL: database.connectionString },
      stdio: 'inherit',
    },
  );
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });
} finally {
  await database.dispose();
}
