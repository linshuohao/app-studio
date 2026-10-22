import type { JsonValue } from '@form-engine/protocol';
import type {
  CapabilityCatalogSnapshot,
  MaterialManifest,
  PureFunctionManifest,
} from '@form-engine/protocol/capability';
import type { LockedCapability } from '@form-engine/protocol/prepared';
import type { CompileInput, ContractValidationResult } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';
import { contentDigest } from '../common/json.js';
import { validateMaterialManifest, validatePureFunctionManifest } from './validation.js';

/** 物料与函数共用查询、自检、身份 / 平台检查和双摘要锁；不导入实现或联网。 */
export function createCapabilityCatalog(
  catalog: CapabilityCatalogSnapshot,
  target: NonNullable<CompileInput['target']>,
  diagnostics: Diagnostics,
  source: (pointer: string) => string,
) {
  function reader<M extends MaterialManifest | PureFunctionManifest>(
    kind: 'materials' | 'pureFunctions',
    entries: Record<string, { manifest: M; artifact: LockedCapability['artifact'] }>,
    validate: (manifest: unknown) => ContractValidationResult,
    missingCode: string,
  ) {
    const contracts = new Map<string, M | undefined>();
    const locked = new Map<string, LockedCapability>();
    function read(id: string, pointer: string): M | undefined {
      if (contracts.has(id)) return contracts.get(id);
      if (!own(entries, id)) {
        diagnostics.error(missingCode, source(pointer), `No ${kind} contract for ${id}.`);
        return undefined;
      }
      const entry = entries[id]!;
      const base = at(at('/' + kind, id), 'manifest');
      const related = (suffix: string) => [{ sourceId: catalog.id, pointer: base + suffix }];
      const contract = validate(entry.manifest);
      for (const error of contract.diagnostics)
        diagnostics.error(error.code, source(pointer), error.message, related(error.sourcePointer));
      const identityMatches = id === entry.manifest.id;
      if (!identityMatches)
        diagnostics.error(
          'CAPABILITY_ID_MISMATCH',
          source(pointer),
          `Catalog key ${id} differs from manifest id ${entry.manifest.id}.`,
          related('/id'),
        );
      const platformMatches =
        target.platform === undefined || target.platform === entry.artifact.platform;
      if (!platformMatches)
        diagnostics.error(
          'CAPABILITY_PLATFORM_MISMATCH',
          source(pointer),
          `Artifact ${entry.artifact.platform} does not match ${target.platform}.`,
          [{ sourceId: catalog.id, pointer: at(at('/' + kind, id), 'artifact') }],
        );
      if (!contract.valid || !identityMatches || !platformMatches) {
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
      read,
      locks: () => Object.fromEntries([...locked].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
    };
  }
  const materials = reader(
    'materials',
    catalog.materials,
    validateMaterialManifest,
    'MATERIAL_NOT_FOUND',
  );
  const functions = reader(
    'pureFunctions',
    catalog.pureFunctions,
    validatePureFunctionManifest,
    'FUNCTION_NOT_FOUND',
  );
  return {
    material: (id: string, pointer: string) => materials.read(id, at(pointer, 'material')),
    pureFunction: functions.read,
    locks: () => ({ materials: materials.locks(), pureFunctions: functions.locks() }),
  };
}
export type CapabilityCatalog = ReturnType<typeof createCapabilityCatalog>;
