import { spawnSync } from 'node:child_process';
for (const task of [
  'format:check',
  'lint',
  'boundaries',
  'build',
  'typecheck',
  'test',
  'test:integration',
  'packages:check',
  'docs:check',
]) {
  console.log(`Checking ${task}`);
  const result = spawnSync('pnpm', [task], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
