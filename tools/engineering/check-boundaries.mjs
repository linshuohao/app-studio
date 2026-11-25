import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
export const allowed = {
  protocol: [],
  devtools: ['runtime'],
  compiler: ['protocol'],
  runtime: ['protocol', 'pure-functions'],
  'pure-functions': ['protocol'],
  'renderer-react': ['runtime', 'protocol'],
  'materials-react': ['protocol', 'renderer-react'],
  'studio-design-components': ['studio-design-tokens'],
  'studio-design-tokens': [],
  'studio-design-handbook': [
    'compiler',
    'materials-react',
    'protocol',
    'pure-functions',
    'renderer-react',
    'runtime',
    'studio-design-components',
    'studio-design-tokens',
  ],
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
  const packagePaths = readdirSync('packages').flatMap((name) =>
    name === 'studio-design'
      ? ['components', 'tokens', 'handbook'].map((member) => `${name}/${member}`)
      : [name],
  );
  for (const path of packagePaths) {
    const manifest = JSON.parse(readFileSync(`packages/${path}/package.json`, 'utf8'));
    checkManifest(manifest.name.replace('@form-engine/', ''), manifest);
  }
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
