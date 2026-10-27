import type { ComponentType } from 'react';
import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import type { ReadonlyJson } from '@form-engine/runtime';
import type {
  AnyMaterialContract,
  MaterialContract,
  MaterialDefinition,
  MaterialRegistry,
  RequestMap,
} from './types.js';
import { copyJson, digest } from './json.js';

/** 仅缓存本模块创建并深度接管的契约；结构相似的外部可变对象不享有这个保证。 */
const contractDigests = new WeakMap<AnyMaterialContract, string>();
/** 同一契约直接匹配；不同契约按摘要匹配，保留等价声明与外部结构化声明的接入。 */
export function matchesMaterialContract(
  actual: AnyMaterialContract,
  expected: AnyMaterialContract,
): boolean {
  if (actual === expected) return true;
  return (
    (contractDigests.get(actual) ?? digest(actual.manifest)) ===
    (contractDigests.get(expected) ?? digest(expected.manifest))
  );
}

/**
 * 接管并冻结静态 Manifest，返回与显式 Props / Binding / Event / Request 类型关联的契约。
 * 不从任意 JSON Schema 自动推导 TS 类型，也不注册组件、订阅或运行实例。
 */
export function defineMaterialContract<
  P extends object = Record<string, ReadonlyJson>,
  B extends string = string,
  E extends Record<string, JsonValue | undefined> = Record<string, JsonValue | undefined>,
  R extends RequestMap = RequestMap,
>(manifest: Omit<MaterialManifest, 'requests'> & { requests?: R }): MaterialContract<P, B, E, R> {
  const captured = copyJson(manifest) as unknown as MaterialManifest;
  const contract = Object.freeze({ manifest: captured, requests: (captured.requests ?? {}) as R });
  contractDigests.set(contract, digest(captured));
  return contract;
}
/** 返回确定制品与 React 组件的只读描述，实际能力锁兼容性在页面装配阶段核对。 */
export function defineMaterial<C extends AnyMaterialContract>(
  contract: C,
  artifact: ArtifactIdentity,
  component: ComponentType,
): MaterialDefinition {
  return Object.freeze({
    contract,
    artifact: copyJson(artifact) as unknown as ArtifactIdentity,
    component,
  });
}
/** 将物料描述组织成按逻辑 ID 查找的只读字典；重复 ID 拒绝，不做 latest 解析或组件加载。 */
export function createMaterialRegistry(
  definitions: readonly MaterialDefinition[],
): MaterialRegistry {
  const entries = new Map<string, MaterialDefinition>();
  for (const definition of definitions) {
    const id = definition.contract.manifest.id;
    if (entries.has(id)) throw Error(`duplicate material: ${id}`);
    entries.set(id, definition);
  }
  return Object.freeze(Object.fromEntries(entries));
}
