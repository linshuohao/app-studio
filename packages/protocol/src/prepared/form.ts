import type { PreparedCommand } from './command.js';
import type { PreparedExpression } from './expression.js';
import type { PreparedDependencyPlan, PreparedScopePattern } from './reference.js';
import type { CapabilityLock, HostRequirements } from './requirements.js';
import type { PreparedValidationPlan } from './validation.js';
import type { PreparedViewPlan } from './view.js';
/** 已准备的联动，不保留原始 watch 以供 Runtime 二次推导；实例按 Scope 模式建立。 */
export interface PreparedReaction {
  id: string;
  scopePatternId?: string;
  /** dependencyPlan 中已按 Reaction 显式 watch 语义确定的观察条目。 */
  observationId: string;
  /** 编译后明确保存的首次激活值；不是观察生命周期归属或重算 / Reset 开关。 */
  runOnActivate: boolean;
  when?: PreparedExpression;
  /** 执行时按当前输入求值，有序且默认不整体回滚。 */
  then: PreparedCommand[];
}
/** Profile 间共享的静态业务计划，与实例当前 Data / Issues / 任务分离。 */
export interface PreparedFormPlan {
  /** 静态模式表，不是所有真实成员的 Scope 注册表或实例 Trie。 */
  scopes: Record<string, PreparedScopePattern>;
  /** 已解析的具名表达式表，PreparedExpression.expressionId 引用此处。 */
  expressions: Record<string, PreparedExpression>;
  reactions: Record<string, PreparedReaction>;
  validation: PreparedValidationPlan;
}
/** 原定义、编译上下文和目标的追溯信息；各版本维度不能互相替代。 */
export interface PreparedIdentity {
  definitionId: string;
  definitionVersion: string;
  protocolVersion: string;
  /** 编译器实现身份用于追踪 / 缓存，不要求与 Runtime 版本字符串相等。 */
  compilerVersion: string;
  catalogSnapshotId: string;
  /** 已选择的 View Profile 名称。 */
  profile: string;
  platform: string;
}
/** 从准备实体回查原始声明的位置；不交付 Compiler 全量内部分析图。 */
export interface DefinitionSourceLocation {
  documentId: string;
  /** 原定义文档内的 JSON Pointer，不是业务 Working Data 的位置。 */
  pointer: string;
}
/** 可序列化、不可变且可跨实例复用的运行输入；不能回退成直接执行原始 Definition。 */
export interface PreparedForm {
  /** Runtime 首期只接受其明确支持的精确格式，与 L1 protocolVersion 独立。 */
  preparedFormatVersion: string;
  identity: PreparedIdentity;
  formPlan: PreparedFormPlan;
  viewPlan: PreparedViewPlan;
  dependencyPlan: PreparedDependencyPlan;
  capabilityLock: CapabilityLock;
  hostRequirements: HostRequirements;
  /** 准备实体 ID 到一个或多个原始声明位置；省略只减少追溯信息，不改变执行语义。 */
  sources?: Record<string, DefinitionSourceLocation[]>;
}
