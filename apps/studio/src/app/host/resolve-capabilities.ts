import { createRuntime } from '@form-engine/runtime';
import { isCoreBinding } from '@form-engine/pure-functions';
import type { ArtifactIdentity } from '@form-engine/protocol';
import { webAssetCompatibility } from '@form-engine/materials-react/web-asset-compatibility';
import type { LockedCapability, ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { canonical, digest } from './read-delivery';
import type { createWebCapabilities } from '../web-capabilities';

type WebRuntime = {
  create: typeof createRuntime;
  ownsCore: typeof isCoreBinding;
};
export type WebCapabilities = ReturnType<typeof createWebCapabilities> & {
  runtime?: WebRuntime;
};

const installedRuntime: WebRuntime = { create: createRuntime, ownsCore: isCoreBinding };

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
  lock: ReadonlyPreparedForm['capabilityLock'],
  available: readonly WebCapabilities[],
) {
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
  const core = Object.values(functions).filter(({ manifest }) => manifest.id.startsWith('core.'));
  const runtime = [
    installedRuntime,
    ...available.flatMap((item) => (item.runtime ? [item.runtime] : [])),
  ].find((engine) => core.every((binding) => engine.ownsCore(binding)));
  if (!runtime) {
    const requirements = core
      .map(({ manifest, artifact }) => `${manifest.id}（${artifact.digest}）`)
      .join('、');
    throw new Error(`当前 Runtime 无法执行发布锁定的内置函数：${requirements}。`);
  }
  return { materials: Object.freeze(materials), functions: Object.freeze(functions), runtime };
}

export async function resolvePreparedWebCapabilities(
  prepared: ReadonlyPreparedForm,
  available: readonly WebCapabilities[],
) {
  const compatibility = webAssetCompatibility(prepared);
  if (compatibility) throw new Error(compatibility.message);
  return resolveWebCapabilities(prepared.capabilityLock, available);
}
