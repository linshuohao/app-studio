import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const python =
  process.env.DOCS_PYTHON ??
  (existsSync('.venv-docs/bin/python') ? '.venv-docs/bin/python' : 'python3');
const result = spawnSync(python, ['tools/docs/build_docs.py', ...process.argv.slice(2)], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
