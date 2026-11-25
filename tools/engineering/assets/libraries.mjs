import { relative } from 'node:path';
import { changesets } from '../release/changesets.mjs';
import { read, baseRead, baseFiles, walk } from './files.mjs';
import { withoutBlock } from './catalog.mjs';

/** Package-level API changes still need Changesets, even when no asset owns them. */
export async function checkLibraries(root, base, assets, changes, consumed) {
  const api = await changesets(),
    workspace = await api.getPackages(root),
    errors = [];
  const names = new Set(workspace.packages.map((p) => p.packageJson.name));
  const exempt = new Set(changes.flatMap((c) => c.noReleasePackages ?? []));
  for (const name of exempt)
    if (!names.has(name)) errors.push(`Unknown no-release package: ${name}`);
  const oldFiles = baseFiles(root, base);
  for (const pkg of workspace.packages) {
    const dir = relative(root, pkg.dir).replaceAll('\\', '/');
    if (!dir.startsWith('packages/')) continue;
    if (dir.startsWith('packages/studio-design/') && pkg.packageJson.private) continue;
    const entries = assets.filter((a) => a.dir === dir);
    const paths = [
      ...new Set([
        ...oldFiles.filter((p) => p.startsWith(`${dir}/src/`) || p.startsWith(`${dir}/schemas/`)),
        ...(await walk(root, `${dir}/src`)),
        ...(await walk(root, `${dir}/schemas`)),
      ]),
    ].filter((p) => {
      if (/\.(?:md|test\.[^/]+|spec\.[^/]+)$/.test(p) || p === `${dir}/src/manifests.ts`)
        return false;
      if (entries.some((a) => p.startsWith(`${dir}/src/${a.folder}/`))) return false;
      return !entries.length || !p.startsWith(`${dir}/src/_internal/`);
    });
    const codeChanged = (
      await Promise.all(
        paths.map(
          async (p) => withoutBlock(await read(root, p)) !== withoutBlock(baseRead(root, base, p)),
        ),
      )
    ).some(Boolean);
    const old = JSON.parse(baseRead(root, base, `${dir}/package.json`) ?? '{}');
    const metadataChanged = ['exports', 'dependencies', 'peerDependencies', 'engines', 'type'].some(
      (field) => JSON.stringify(old[field]) !== JSON.stringify(pkg.packageJson[field]),
    );
    const covered =
      consumed.packages.has(pkg.packageJson.name) ||
      changes.some((c) => c.releases.some((r) => r.name === pkg.packageJson.name));
    if (!covered && (metadataChanged || (codeChanged && !exempt.has(pkg.packageJson.name))))
      errors.push(`Missing package release declaration: ${pkg.packageJson.name}`);
  }
  return errors;
}
