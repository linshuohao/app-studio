import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { checkAssets } from '../assets/check.mjs';
import { updateVersion, inventory } from '../assets/catalog.mjs';
import { read, walk, digest, git, baseCommit } from '../assets/files.mjs';
import { changesets } from './changesets.mjs';
import { generated } from '../assets/format.mjs';

export async function inputFiles(root) {
  const paths = new Set([
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'prettier.config.mjs',
    '.prettierignore',
    'eslint.config.mjs',
    'vitest.config.ts',
    'playwright.config.ts',
    'playwright.devtools.config.ts',
    'tsconfig.tests.json',
    'turbo.json',
  ]);
  for (const dir of [
    'packages',
    'apps',
    'services',
    '.changeset',
    'tools/engineering',
    'tools/config',
    'tests',
    '.github/workflows',
  ]) {
    for (const file of await walk(root, dir)) {
      if (dir === '.changeset' && file.startsWith('.changeset/.')) continue;
      if (
        dir === 'packages' ||
        dir === '.changeset' ||
        !['apps', 'services'].includes(dir) ||
        file.endsWith('/package.json')
      )
        paths.add(file);
    }
  }
  const result = {};
  for (const path of [...paths].sort()) {
    const text = await read(root, path);
    if (text !== null) result[path] = text;
  }
  return result;
}
export const fingerprint = (files) =>
  Object.fromEntries(
    Object.keys(files)
      .sort()
      .map((p) => [p, digest(files[p])]),
  );
export function planDigest(plan) {
  const data = { ...plan };
  delete data.digest;
  return digest(data);
}

/** The real workspace stays read-only; Changesets applies into a disposable mirror. */
export async function createReleasePlan({ root, base }) {
  base = baseCommit(root, base);
  const inputs = await inputFiles(root);
  const state = await checkAssets({ root, base, forRelease: true });
  if (state.errors.length) throw Error(state.errors.join('\n'));
  const api = await changesets();
  const workspace = await api.getPackages(root);
  const { config, errors } = await api.readConfig(root, workspace);
  if (!config) throw Error(`Changesets configuration: ${errors.join('; ')}`);
  if (!config.privatePackages.version)
    throw Error('Enable privatePackages.version for private library version preparation.');
  const preparedChanges = state.changes.map(
    ({
      assets: _assets,
      noRelease: _noRelease,
      noReleasePackages: _packages,
      schemaVersion: _schema,
      ...change
    }) => change,
  );
  const packagePlan = api.assemble(preparedChanges, workspace, config);
  const previous = new Map((await inventory(root, base)).map((a) => [a.id, a]));
  const assets = state.assets
    .filter((a) => state.releases[a.id])
    .map((a) => {
      const old = previous.get(a.id),
        bump = state.releases[a.id];
      const from = old?.manifest.version ?? null;
      if (from !== null && from !== a.manifest.version)
        throw Error(`Do not manually bump asset versions: ${a.id}`);
      const to = from === null ? a.manifest.version : api.semver.inc(from, bump);
      if (!api.semver.valid(to)) throw Error(`Invalid managed asset version: ${a.id}`);
      return { id: a.id, kind: a.kind, path: a.path, from, to, bump };
    });
  const scratch = await mkdtemp(join(tmpdir(), 'form-release-'));
  try {
    for (const [path, content] of Object.entries(inputs)) {
      await mkdir(dirname(join(scratch, path)), { recursive: true });
      await writeFile(join(scratch, path), content);
    }
    // Changesets' changelog reader asks Git for source commits. Use an empty local
    // scratch repository; never expose the live index, fetch or run user hooks.
    git(scratch, '-c', 'init.templateDir=', 'init', '-q');
    git(
      scratch,
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'commit.gpgSign=false',
      '-c',
      'user.name=Release preparation',
      '-c',
      'user.email=release@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'scratch',
    );
    const remap = (pkg) => ({
      ...pkg,
      dir: resolve(scratch, relative(root, pkg.dir)),
      packageJson: structuredClone(pkg.packageJson),
    });
    const mirror = {
      ...workspace,
      rootDir: scratch,
      rootPackage: workspace.rootPackage && remap(workspace.rootPackage),
      packages: workspace.packages.map(remap),
    };
    const context = createRequire(import.meta.resolve('@changesets/cli')).resolve(
      '@changesets/cli/package.json',
    );
    await api.apply(packagePlan, mirror, { ...config, format: false }, undefined, dirname(context));
    for (const asset of assets) {
      const entry = state.assets.find((a) => a.id === asset.id);
      await writeFile(join(scratch, asset.path), updateVersion(entry, asset.to));
      const path = `${entry.dir}/src/${entry.folder}/CHANGELOG.md`;
      const reasons = state.changes
        .filter((c) => c.assets.some((a) => a.id === asset.id))
        .map((c) => `- ${c.summary}`)
        .join('\n');
      const oldLog = (await read(root, path))?.replace(/^# [^\n]+\n/, '') ?? '';
      await writeFile(
        join(scratch, path),
        await generated(root, path, `# ${asset.id}\n\n## ${asset.to}\n\n${reasons}\n\n${oldLog}`),
      );
    }
    const outputs = await inputFiles(scratch);
    const files = [...new Set([...Object.keys(inputs), ...Object.keys(outputs)])]
      .sort()
      .map((path) => ({ path, before: inputs[path] ?? null, after: outputs[path] ?? null }))
      .filter((e) => e.before !== e.after);
    const plan = {
      schemaVersion: 1,
      base,
      inputs: fingerprint(inputs),
      assets,
      packages: packagePlan.releases,
      files,
    };
    if (JSON.stringify(fingerprint(await inputFiles(root))) !== JSON.stringify(plan.inputs))
      throw Error('Stale release plan: workspace changed while planning.');
    return { ...plan, digest: planDigest(plan) };
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}
