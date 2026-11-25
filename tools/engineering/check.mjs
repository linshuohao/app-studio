import { spawnSync } from 'node:child_process';
// Check committed generation before build can refresh it and hide stale artifacts.
for (const task of [
  'protocol:schema:check',
  'assets:check',
  'format:check',
  'lint',
  'boundaries',
  'build',
  'typecheck',
  'test',
  'test:integration',
  'packages:check',
  'docs:build',
  'docs:check',
]) {
  console.log(`Checking ${task}`);
  const result = spawnSync('pnpm', [task], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
