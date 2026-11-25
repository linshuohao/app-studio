import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const scratch = mkdtempSync(join(tmpdir(), 'form-studio-handbook-'));
const env = { ...process.env, STUDIO_HANDBOOK_ROOT: join(scratch, 'site') };
try {
  execFileSync('python3', ['tools/docs/studio_catalog.py', 'check'], { stdio: 'inherit' });
  execFileSync('pnpm', ['handbook:build'], { stdio: 'inherit', env });
  if (!process.argv.includes('--build-only')) {
    execFileSync(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '--config',
        'packages/studio-design/handbook/playwright.config.ts',
        '--output',
        join(scratch, 'results'),
      ],
      { stdio: 'inherit', env },
    );
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
