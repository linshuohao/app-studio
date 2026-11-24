import { randomUUID } from 'node:crypto';
import { inventory } from './catalog.mjs';
import { applyEdits, withWorkspaceLock } from './files.mjs';
import { generated } from './format.mjs';
import { changesets } from '../release/changesets.mjs';

export const marker = /```capability-changes\n([\s\S]*?)\n```/g;
export function assetChanges(summary) {
  const matches = [...summary.matchAll(marker)];
  if (!matches.length) return { assets: [], noRelease: [], noReleasePackages: [], summary };
  if (matches.length !== 1) throw Error('Expected one capability-changes block per changeset.');
  const data = JSON.parse(matches[0][1]);
  data.noReleasePackages ??= [];
  if (
    !Array.isArray(data.noReleasePackages) ||
    data.noReleasePackages.some((p) => typeof p !== 'string')
  )
    throw Error('Invalid no-release package declaration.');
  if (data.schemaVersion !== 1 || !Array.isArray(data.assets) || !Array.isArray(data.noRelease))
    throw Error('Invalid capability-changes declaration.');
  for (const item of [...data.assets, ...data.noRelease]) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !['material', 'function'].includes(item.kind) ||
      (data.assets.includes(item) && !['patch', 'minor', 'major'].includes(item.bump))
    )
      throw Error('Invalid asset change entry.');
  }
  return { ...data, summary: summary.replace(marker, '').trim() };
}
/** @param {{root: string, id?: string, packageName?: string, bump?: 'patch'|'minor'|'major', summary: string, noRelease?: boolean}} options */
export async function writeAssetChange({
  root,
  id,
  packageName,
  bump,
  summary,
  noRelease = false,
}) {
  return withWorkspaceLock(root, () =>
    writeChange({ root, id, packageName, bump, summary, noRelease }),
  );
}
async function writeChange({ root, id, packageName, bump, summary, noRelease }) {
  if (!summary?.trim() || summary.includes('```capability-changes'))
    throw Error('A plain change summary is required.');
  if (!noRelease && !['patch', 'minor', 'major'].includes(bump))
    throw Error('Expected patch, minor or major.');
  if (Boolean(id) === Boolean(packageName)) throw Error('Choose exactly one --id or --package.');
  if (noRelease && bump) throw Error('Choose a bump or no-release, not both.');
  const asset = id ? (await inventory(root)).find((a) => a.id === id) : undefined;
  if (id && !asset) throw Error(`Unknown asset: ${id}`);
  const pkg = asset?.package ?? packageName;
  if (
    !(await (await changesets()).getPackages(root)).packages.some((p) => p.packageJson.name === pkg)
  )
    throw Error(`Unknown package: ${pkg}`);
  const data = {
    schemaVersion: 1,
    assets: asset && !noRelease ? [{ id, kind: asset.kind, bump }] : [],
    noRelease: asset && noRelease ? [{ id, kind: asset.kind }] : [],
    noReleasePackages: !asset && noRelease ? [pkg] : [],
  };
  const file = `.changeset/asset-${randomUUID()}.md`;
  const after = `---\n${noRelease ? '{}' : `${JSON.stringify(pkg)}: ${bump}`}\n---\n\n${summary.trim()}\n\n\`\`\`capability-changes\n${JSON.stringify(data, null, 2)}\n\`\`\`\n`;
  await applyEdits(root, [{ path: file, before: null, after: await generated(root, file, after) }]);
  return { file };
}
