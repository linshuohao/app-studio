import type { ComponentType } from 'react';
import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { MaterialManifest, RequestContract } from '@form-engine/protocol/capability';
import type { ReadonlyJson } from '@form-engine/runtime';

/** 类型标记只服务开发接入，执行契约始终是可序列化 Schema。 */
export interface TypedRequest<
  I extends JsonValue = JsonValue,
  O extends JsonValue = JsonValue,
> extends RequestContract {
  readonly __types?: { readonly input: I; readonly output: O };
}
export type RequestMap = Record<string, TypedRequest>;
/** 物料的静态契约与开发类型凭据，不包含挂载实例、字段值或请求状态。 */
export interface MaterialContract<
  P extends object = Record<string, ReadonlyJson>,
  B extends string = string,
  E extends Record<string, JsonValue | undefined> = Record<string, JsonValue | undefined>,
  R extends RequestMap = RequestMap,
> {
  readonly manifest: MaterialManifest;
  readonly requests: R;
  readonly __types?: { readonly props: P; readonly bindings: B; readonly events: E };
}
export type AnyMaterialContract = MaterialContract<object>;
/** 一份确定的 React 物料实现描述，页面装配时与能力锁核对。 */
export interface MaterialDefinition {
  readonly contract: AnyMaterialContract;
  readonly artifact: ArtifactIdentity;
  readonly component: ComponentType;
}
/** 按逻辑 ID 查询固定描述；当前选择由 Host 提供，不在 Renderer 内解析版本。 */
export type MaterialRegistry = Readonly<Record<string, MaterialDefinition>>;
