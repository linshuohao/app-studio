import { inventory, packages, aggregate, updateBlock, staticEntry } from './catalog.mjs';
import { read, walk, baseCommit, baseRead, baseFiles } from './files.mjs';
import { assetChanges } from './change.mjs';
import { changesets } from '../release/changesets.mjs';
import { consumedChanges } from './consumed.mjs';
import { checkLibraries } from './libraries.mjs';

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function breaking(old, next, kind) {
  if (kind === 'function') {
    if (!same(old.returns, next.returns) && old.returns !== true) return true;
    if (
      old.restParameter &&
      (!next.restParameter ||
        (!same(old.restParameter.schema, next.restParameter.schema) &&
          next.restParameter.schema !== true))
    )
      return true;
    if (next.parameters.length < old.parameters.length) return true;
    if (next.parameters.slice(old.parameters.length).some((p) => !p.optional)) return true;
    return old.parameters.some(
      (p, i) =>
        (!same(p.schema, next.parameters[i].schema) && next.parameters[i].schema !== true) ||
        (p.optional && !next.parameters[i].optional),
    );
  }
  for (const field of ['bindings', 'events', 'requests']) {
    for (const [key, contract] of Object.entries(old[field] ?? {})) {
      if (!Object.hasOwn(next[field] ?? {}, key) || !same(contract, next[field][key])) return true;
    }
  }
  if ((old.slots ?? []).some((s) => !(next.slots ?? []).includes(s))) return true;
  if (Object.keys(next.requests ?? {}).some((r) => !Object.hasOwn(old.requests ?? {}, r)))
    return true;
  if (
    (next.propsSchema?.required ?? []).some((p) => !(old.propsSchema?.required ?? []).includes(p))
  )
    return true;
  const oldProps = old.propsSchema?.properties ?? {},
    newProps = next.propsSchema?.properties ?? {};
  return Object.keys(oldProps).some(
    (p) => !Object.hasOwn(newProps, p) || !same(oldProps[p], newProps[p]),
  );
}
export async function declarations(root) {
  const api = await changesets();
  if ((await read(root, '.changeset/pre.json')) !== null)
    throw Error('Prerelease mode is not supported by asset tooling.');
  return (await api.read(root)).map((change) => ({ ...change, ...assetChanges(change.summary) }));
}
export async function checkAssets({ root, base, forRelease = false }) {
  const errors = [];
  try {
    base = baseCommit(root, base);
    const assets = await inventory(root),
      previous = await inventory(root, base),
      changes = await declarations(root);
    const before = new Map(previous.map((a) => [a.id, a]));
    const consumed = await consumedChanges(root, base, assets, previous);
    errors.push(...consumed.errors);
    const released = new Map(),
      exempt = new Set();
    const rank = { patch: 1, minor: 2, major: 3 };
    for (const change of changes) {
      for (const record of [...change.assets, ...change.noRelease]) {
        const asset = assets.find((a) => a.id === record.id && a.kind === record.kind);
        if (!asset) {
          errors.push(`Unknown asset declaration: ${record.id}`);
          continue;
        }
        if (change.noRelease.includes(record)) exempt.add(asset.id);
        else {
          const packageRelease = change.releases.find((r) => r.name === asset.package);
          if (!packageRelease || rank[packageRelease.type] < rank[record.bump])
            errors.push(`Package declaration does not cover asset: ${asset.id}`);
          if (!released.has(asset.id) || rank[record.bump] > rank[released.get(asset.id)])
            released.set(asset.id, record.bump);
        }
      }
    }
    for (const kind of Object.keys(packages)) {
      const dir = `packages/${packages[kind]}`,
        entries = assets.filter((a) => a.kind === kind);
      for (const [file, runtime] of [
        ['manifests.ts', false],
        ['index.ts', true],
      ]) {
        const content = await read(root, `${dir}/src/${file}`);
        if (
          entries.length &&
          content?.replace(/\s/g, '') !==
            updateBlock(content, aggregate(entries, runtime)).replace(/\s/g, '')
        )
          errors.push(`Asset aggregate/exports mismatch: ${dir}/src/${file}`);
        if (!runtime && content && !staticEntry(content, entries))
          errors.push(`Static manifest entry loads runtime code: ${dir}/src/${file}`);
      }
      const oldPaths = baseFiles(root, base).filter((p) => p.startsWith(`${dir}/src/`));
      const paths = [...new Set([...oldPaths, ...(await walk(root, `${dir}/src`))])];
      const sharedChanged = (
        await Promise.all(
          paths
            .filter((p) => p.startsWith(`${dir}/src/_internal/`))
            .map(async (p) => (await read(root, p)) !== baseRead(root, base, p)),
        )
      ).some(Boolean);
      for (const asset of entries) {
        const old = before.get(asset.id),
          prefix = `${dir}/src/${asset.folder}/`;
        const files = paths.filter((p) => p.startsWith(prefix) && !p.endsWith('.md'));
        const changed =
          !old ||
          sharedChanged ||
          (
            await Promise.all(
              files.map(async (p) => (await read(root, p)) !== baseRead(root, base, p)),
            )
          ).some(Boolean);
        const contractChanged = !old || !same(old.manifest, asset.manifest);
        if (
          changed &&
          !released.has(asset.id) &&
          !consumed.coverage.has(asset.id) &&
          (!exempt.has(asset.id) || contractChanged)
        )
          errors.push(`Missing release declaration for changed asset/contract: ${asset.id}`);
        if (
          old &&
          breaking(old.manifest, asset.manifest, kind) &&
          released.get(asset.id) !== 'major' &&
          consumed.coverage.get(asset.id) !== 'major'
        )
          errors.push(`Breaking contract requires major: ${asset.id}`);
        const extension = kind === 'material' ? 'tsx' : 'ts';
        for (const file of [
          `${prefix}implementation.${extension}`,
          `${prefix}README.md`,
          `${dir}/tests/${asset.folder}/implementation.test.${extension}`,
        ]) {
          const content = await read(root, file);
          if (content === null) errors.push(`Missing asset file: ${file}`);
          else if (
            forRelease &&
            /\b(?:it|test|describe)\.(?:todo|skip)\s*\(|Asset .+ not implemented/.test(content)
          )
            errors.push(`Unimplemented/unfinished asset: ${file}`);
        }
      }
    }
    errors.push(...(await checkLibraries(root, base, assets, changes, consumed)));
    for (const old of previous)
      if (!assets.some((a) => a.id === old.id))
        errors.push(
          `Asset removal needs an explicit migration; preserve the old asset until addressed: ${old.id}`,
        );
    return { base, assets, changes, releases: Object.fromEntries(released), errors };
  } catch (error) {
    return { errors: [error.message] };
  }
}
