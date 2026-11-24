import { readFile, lstat } from 'node:fs/promises';
import { identity, inventory, aggregate, updateBlock, hasExport } from './catalog.mjs';
import { read, safePath, applyEdits, withWorkspaceLock } from './files.mjs';
import { generated } from './format.mjs';

export async function createAsset({ root, kind, id, dryRun = false }) {
  return dryRun
    ? generate({ root, kind, id, dryRun })
    : withWorkspaceLock(root, () => generate({ root, kind, id, dryRun }));
}
async function generate({ root, kind, id, dryRun }) {
  const entry = identity(kind, id);
  const assets = await inventory(root);
  if (
    assets.some(
      (a) =>
        a.id === id ||
        (a.dir === entry.dir && (a.folder === entry.folder || a.symbol === entry.symbol)),
    )
  )
    throw Error(`Asset already exists: ${id}`);
  for (const type of ['src', 'tests']) {
    const directory = await safePath(root, `${entry.dir}/${type}/${entry.folder}`);
    try {
      await lstat(directory);
      throw Error(`Asset directory already exists: ${directory}`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (hasExport(await read(root, `${entry.dir}/src/index.ts`), `create${entry.title}`))
    throw Error(`Public export already exists: create${entry.title}`);
  if (hasExport(await read(root, `${entry.dir}/src/manifests.ts`), `${entry.symbol}Manifest`))
    throw Error(`Public export already exists: ${entry.symbol}Manifest`);
  const extension = kind === 'material' ? 'tsx' : 'ts';
  const edits = [];
  for (const [template, target] of [
    [`${kind}-manifest`, `${entry.dir}/src/${entry.folder}/manifest.ts`],
    [`${kind}-implementation`, `${entry.dir}/src/${entry.folder}/implementation.${extension}`],
    [`${kind}-test`, `${entry.dir}/tests/${entry.folder}/implementation.test.${extension}`],
    ['readme', `${entry.dir}/src/${entry.folder}/README.md`],
  ]) {
    const before = await read(root, target);
    if (before !== null) throw Error(`File already exists: ${target}`);
    let after = await readFile(new URL(`./templates/${template}.tpl`, import.meta.url), 'utf8');
    for (const [key, value] of Object.entries({ ID: id, TITLE: entry.title }))
      after = after.replaceAll(`__${key}__`, value);
    edits.push({ path: target, before, after: await generated(root, target, after) });
  }
  const entries = [...assets.filter((a) => a.dir === entry.dir), entry].sort((a, b) =>
    a.folder.localeCompare(b.folder),
  );
  for (const [name, runtime] of [
    ['manifests.ts', false],
    ['index.ts', true],
  ]) {
    const path = `${entry.dir}/src/${name}`,
      before = await read(root, path);
    const body = await generated(root, path, aggregate(entries, runtime));
    edits.push({ path, before, after: updateBlock(before, body.trimEnd()) });
  }
  for (const edit of edits) await safePath(root, edit.path);
  if (!dryRun) await applyEdits(root, edits);
  return { id, kind, files: edits.map((e) => e.path), dryRun };
}
