import type { ArtifactIdentity, ContentDigest } from '../common.js';
/** Compiler 使用的契约与 Runtime 实际装配的制品分别锁定，不按 latest 重新解析。 */
export interface LockedCapability {
  id: string;
  version: string;
  /** 确定性序列化的 Manifest 内容摘要，与实现制品字节摘要区分。 */
  manifestDigest: ContentDigest;
  /** 同一制品可提供多个能力；装载核对不能仅比较版本字符串。 */
  artifact: ArtifactIdentity;
}
/** 当前平台 / Profile 的唯一能力集合，包含确定的 core.* 实现身份。 */
export interface CapabilityLock {
  materials: Record<string, LockedCapability>;
  pureFunctions: Record<string, LockedCapability>;
}
/** 静态校验能力需求；适用 Validator 缺失必须视为未完成，不能 optional 放行。 */
export interface HostValidatorRequirement {
  name: string;
  /** 引用同一能力的规则来源，实例和任务仍彼此独立。 */
  constraintIds: string[];
  /** 有 Host 静态契约时记录；省略不意味着实现存在或兼容性已被证明。 */
  contractVersion?: string;
}
/** 已编译出的 Host 业务事件需求，不是物料内部事件列表。 */
export interface HostEventRequirement {
  name: string;
  /** 编译后显式记录是否允许缺失；必要业务操作的降级由 Host 决定。 */
  optional: boolean;
  contractVersion?: string;
}
/** 按 Host 请求名称聚合的需求；具体输入输出契约保留在各节点映射中。 */
export interface HostRequestRequirement {
  name: string;
  /** 引用该能力的静态 PreparedMaterialNode id，不是运行时挂载实例 ID。 */
  nodeIds: string[];
}
/** 装载 / 调用时核对的 Host 能力摘要，不包含注册函数、请求策略或 cancel 句柄。 */
export interface HostRequirements {
  validators: HostValidatorRequirement[];
  events: HostEventRequirement[];
  requests: HostRequestRequirement[];
}
