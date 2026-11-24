import { read, baseRead, git } from './files.mjs';
import { assetChanges } from './change.mjs';
import { changesets } from '../release/changesets.mjs';

/** A release PR removes pending changesets; validate their expected versions from Git. */
export async function consumedChanges(root, base, assets, previous) {
  const api = await changesets();
  const paths = git(root, 'ls-tree', '-r', '--name-only', base, '--', '.changeset').split('\n');
  const consumed = [];
  for (const path of paths.filter((p) => /^\.changeset\/(?!README\.md$)[^.][^/]*\.md$/.test(p))) {
    if ((await read(root, path)) !== null) continue;
    const parsed = api.parse(baseRead(root, base, path));
    consumed.push({ ...parsed, ...assetChanges(parsed.summary), id: path.slice(11, -3) });
  }
  const coverage = new Map(),
    errors = [],
    packages = new Set();
  if (!consumed.length) return { coverage, packages, errors };
  const workspace = await api.getPackages(root);
  const oldPackage = (pkg) => ({
    ...pkg,
    packageJson: JSON.parse(
      baseRead(root, base, `${pkg.dir.slice(root.length + 1)}/package.json`) ??
        JSON.stringify(pkg.packageJson),
    ),
  });
  const oldWorkspace = { ...workspace, packages: workspace.packages.map(oldPackage) };
  const { config, errors: configErrors } = await api.readConfig(root, oldWorkspace);
  if (!config) throw Error(configErrors.join('\n'));
  const expected = api.assemble(
    consumed.map((c) => ({ ...c, summary: c.summary })),
    oldWorkspace,
    config,
  );
  for (const release of expected.releases) {
    const pkg = workspace.packages.find((p) => p.packageJson.name === release.name);
    if (pkg?.packageJson.version !== release.newVersion)
      errors.push(`Consumed changeset does not match applied package version: ${release.name}`);
    else packages.add(release.name);
  }
  const rank = { patch: 1, minor: 2, major: 3 };
  for (const record of consumed.flatMap((c) => c.assets)) {
    const asset = assets.find((a) => a.id === record.id && a.kind === record.kind),
      old = previous.find((a) => a.id === record.id);
    if (!asset || !old || !packages.has(asset.package)) continue;
    if (asset.manifest.version === api.semver.inc(old.manifest.version, record.bump)) {
      if (!coverage.has(asset.id) || rank[record.bump] > rank[coverage.get(asset.id)])
        coverage.set(asset.id, record.bump);
    }
  }
  return { coverage, packages, errors };
}
