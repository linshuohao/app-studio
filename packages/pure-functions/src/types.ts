import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { PureFunctionManifest } from '@form-engine/protocol/capability';

/** 一个纯函数的静态契约、制品身份和同步实现；Compiler 与 Runtime 使用同一份身份。 */
export interface FunctionBinding {
  /** 参数 / 返回值签名，供 Compiler 检查及 Runtime 装载与调用门禁使用。 */
  readonly manifest: PureFunctionManifest;
  /** Host 提供的构建制品标识，必须匹配 Prepared 能力锁。 */
  readonly artifact: ArtifactIdentity;
  /** 普通函数的同步调用入口；惰性控制形式由表达式求值器单独解释。 */
  readonly invoke: (args: readonly JsonValue[]) => JsonValue;
}
/** 函数 ID → 实现绑定；装载后按 Prepared 所需项固定，不动态替换。 */
export type FunctionRegistry = Readonly<Record<string, FunctionBinding>>;
