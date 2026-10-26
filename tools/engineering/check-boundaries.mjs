import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
export const allowed = {
  protocol: [],
  compiler: ['protocol'],
  runtime: ['protocol', 'pure-functions'],
  'pure-functions': ['protocol'],
  'renderer-react': ['runtime', 'protocol'],
  'materials-react': ['protocol', 'renderer-react'],
};
export function checkManifest(name, manifest) {
  for (const dependency of Object.keys({
    ...manifest.dependencies,
    ...manifest.peerDependencies,
    ...manifest.devDependencies,
  })) {
    if (dependency.startsWith('@form-engine/'))
      assert(
        allowed[name]?.includes(dependency.slice(13)),
        `${name} cannot depend on ${dependency}`,
      );
    if (['protocol', 'compiler', 'runtime', 'pure-functions'].includes(name))
      assert(
        !/^(react(?:-dom)?|next|@nestjs\/)/.test(dependency),
        `${name} cannot depend on ${dependency}`,
      );
  }
}
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').at(-1))) {
  for (const name of readdirSync('packages'))
    checkManifest(name, JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8')));
  const result = spawnSync(
    'pnpm',
    [
      'exec',
      'depcruise',
      '--config',
      '.dependency-cruiser.mjs',
      'packages',
      'apps/playground/src',
      'services/api/src',
    ],
    { stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
