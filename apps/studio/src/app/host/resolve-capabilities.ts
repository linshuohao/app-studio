import { isCoreBinding } from '@form-engine/pure-functions';
import type { ArtifactIdentity } from '@form-engine/protocol';
import type { LockedCapability } from '@form-engine/protocol/prepared';
import type { LoadedRelease } from './read-delivery';
import { canonical, digest } from './read-delivery';
import type { createWebCapabilities } from '../web-capabilities';

export type WebCapabilities = ReturnType<typeof createWebCapabilities>;

async function resolveBindings<T extends { artifact: ArtifactIdentity }>(
  locks: Readonly<Record<string, Readonly<LockedCapability>>>,
  registries: readonly Readonly<Record<string, T>>[],
  getManifest: (binding: T) => { id: string; version: string },
  label: string,
): Promise<Record<string, T>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(locks).map(async ([id, lock]) => {
        for (const registry of registries) {
          const binding = Object.hasOwn(registry, id) ? registry[id] : undefined;
          if (!binding || id !== lock.id || lock.artifact.platform !== 'web') continue;
          const manifest = getManifest(binding);
          if (
            manifest.id === id &&
            manifest.version === lock.version &&
            canonical(binding.artifact) === canonical(lock.artifact) &&
            (await digest(canonical(manifest))) === lock.manifestDigest
          ) {
            return [id, binding] as const;
          }
        }
        throw new Error(
          `缺少匹配的${label}：${id} @ ${lock.version}（制品 ${lock.artifact.digest}）。`,
        );
      }),
    ),
  );
}

export async function resolveWebCapabilities(
  lock: LoadedRelease['capabilityLock'],
  available: readonly WebCapabilities[],
): Promise<WebCapabilities> {
  const [materials, functions] = await Promise.all([
    resolveBindings(
      lock.materials,
      available.map(({ materials }) => materials),
      (binding) => binding.contract.manifest,
      '物料',
    ),
    resolveBindings(
      lock.pureFunctions,
      available.map(({ functions }) => functions),
      (binding) => binding.manifest,
      '函数',
    ),
  ]);
  for (const [id, binding] of Object.entries(functions)) {
    if (id.startsWith('core.') && !isCoreBinding(binding)) {
      throw new Error(
        `当前 Runtime 无法执行发布锁定的内置函数：${id}（制品 ${binding.artifact.digest}）。`,
      );
    }
  }
  return { materials: Object.freeze(materials), functions: Object.freeze(functions) };
}
