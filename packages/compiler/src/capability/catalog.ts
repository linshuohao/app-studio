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

/**
 * 本次编译的物料查询器：按需读取固定 Catalog，缓存自检结果并收集使用锁。
 * 不访问 Registry、不加载实现；未使用的物料不进入产物锁。
 */
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
    // 自检检查声明自身；下方再检查 Catalog 键、目标平台等使用上下文。
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
    // 声明摘要由静态内容计算；实现制品摘要来自快照，两者不可互相替代。
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
