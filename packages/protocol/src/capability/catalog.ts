import type { ArtifactIdentity } from '../common.js';
import type { HostContract } from './host.js';
import type { MaterialManifest } from './material.js';
import type { PureFunctionManifest } from './pure-function.js';

/** 已选择的物料契约与目标实现；Compiler 不在该条目中运行组件代码。 */
export interface MaterialCatalogEntry {
  manifest: MaterialManifest;
  artifact: ArtifactIdentity;
}
/** 已选择的纯函数契约与目标实现；编译只检查签名，不执行该函数。 */
export interface PureFunctionCatalogEntry {
  manifest: PureFunctionManifest;
  artifact: ArtifactIdentity;
}
/** Compiler 接收的确定快照，不是 Registry 搜索 API，也不表示运行时可变的 latest 集合。 */
export interface CapabilityCatalogSnapshot {
  /** 已解析快照身份，进入 Prepared 的追溯 / 缓存依据。 */
  id: string;
  /** 键与对应 Manifest id 应一致；唯一解析和制品关联由编译 / 构建边界检查。 */
  materials: Record<string, MaterialCatalogEntry>;
  pureFunctions: Record<string, PureFunctionCatalogEntry>;
  /** 省略时 Compiler 仍提取明确需求，由运行时核对，不伪造静态兼容保证。 */
  host?: HostContract;
}
