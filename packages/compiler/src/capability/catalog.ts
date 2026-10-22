import type { JsonValue } from '@form-engine/protocol';
import type { CapabilityCatalogSnapshot } from '@form-engine/protocol/capability';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import type { LockedCapability } from '@form-engine/protocol/prepared';
import type { CompileInput } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';
import { contentDigest } from '../common/json.js';
import { validateMaterialManifest } from './validation.js';

export function createMaterialCatalog(
  catalog: CapabilityCatalogSnapshot,
  target: NonNullable<CompileInput['target']>,
  diagnostics: Diagnostics,
  source: (pointer: string) => string,
) {
  const locked = new Map<string, LockedCapability>();
  const contracts = new Map<string, MaterialManifest | undefined>();
  function material(id: string, pointer: string): MaterialManifest | undefined {
    if (contracts.has(id)) return contracts.get(id);
    if (!own(catalog.materials, id)) {
      diagnostics.error(
        'MATERIAL_NOT_FOUND',
        source(at(pointer, 'material')),
        `No material contract for ${id}.`,
      );
      return undefined;
    }
    const entry = catalog.materials[id]!;
    const base = at(at('/materials', id), 'manifest');
    const related = (suffix: string) => [{ sourceId: catalog.id, pointer: base + suffix }];
    const contract = validateMaterialManifest(entry.manifest);
    for (const error of contract.diagnostics)
      diagnostics.error(
        error.code,
        source(at(pointer, 'material')),
        error.message,
        related(error.sourcePointer),
      );
    if (id !== entry.manifest.id)
      diagnostics.error(
        'CAPABILITY_ID_MISMATCH',
        source(at(pointer, 'material')),
        `Catalog key ${id} differs from manifest id ${entry.manifest.id}.`,
        related('/id'),
      );
    if (target.platform !== undefined && target.platform !== entry.artifact.platform)
      diagnostics.error(
        'CAPABILITY_PLATFORM_MISMATCH',
        source(at(pointer, 'material')),
        `Material artifact ${entry.artifact.platform} does not match ${target.platform}.`,
        [{ sourceId: catalog.id, pointer: at(at('/materials', id), 'artifact') }],
      );
    if (
      !contract.valid ||
      id !== entry.manifest.id ||
      (target.platform !== undefined && target.platform !== entry.artifact.platform)
    ) {
      contracts.set(id, undefined);
      return undefined;
    }
    contracts.set(id, entry.manifest);
    locked.set(id, {
      id,
      version: entry.manifest.version,
      manifestDigest: contentDigest(entry.manifest as unknown as JsonValue),
      artifact: entry.artifact,
    });
    return entry.manifest;
  }

  return {
    material,
    locks: () => Object.fromEntries([...locked].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
}
