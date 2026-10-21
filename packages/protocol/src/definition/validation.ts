import type { MessageSpec } from '../common.js';
import type { Expression } from './expression.js';
import type { DataReference, ScopeDeclaration } from './reference.js';
/** 字段的同步启动资格：相关 Schema / 适用 Internal 已完成且无错误，不证明异步或完整通过。 */
export interface FieldPrerequisite {
  kind: 'field';
  /** 当前唯一 Scope 实例下的字段位置；不聚合其他成员的同名字段。 */
  target: DataReference;
  phase: 'sync';
}
/** 指定同步 Constraint 的本轮通过结论；External 目标、环和自包含由 Compiler 拒绝。 */
export interface ConstraintPrerequisite {
  kind: 'constraint';
  /** 声明 ID，由 Compiler 解析到唯一可绑定的 Scope 规则实例模式。 */
  constraintId: string;
}
/** 多项前置须全部满足；首期不支持跨异步等待及集合 or / any。 */
export type ValidationPrerequisite = FieldPrerequisite | ConstraintPrerequisite;
/** 内部业务断言失败时产生的 Issue 声明，不在此存放当前校验结果。 */
export interface IssueDefinition {
  /** 错误归属位置；该目标本身不自动成为规则的读取依赖。 */
  target: DataReference;
  /** 稳定业务错误码，独立于展示语言和执行异常诊断。 */
  code: string;
  /** 专属文案覆盖；省略时由默认消息体系处理。 */
  message?: MessageSpec;
}
/** 同步业务断言；when / assert 的可推导读取由 Compiler 合并，不另填 watch。 */
export interface InternalConstraint {
  id: string;
  kind: 'internal';
  scope?: ScopeDeclaration;
  /** 适用条件；不再适用时该规则的旧 Issue 不应保留为当前结果。 */
  when?: Expression;
  /** 本轮同步前置；省略表示没有显式额外前置。 */
  requires?: ValidationPrerequisite[];
  /** 必须返回 boolean；求值异常不是业务 false，也不执行 Command。 */
  assert: Expression;
  issue: IssueDefinition;
}
/** Host 外部校验义务。Host 读取本次调用快照 / Scope，网络、重试与多步异步留在实现内部。 */
export interface ExternalConstraint {
  id: string;
  kind: 'external';
  /** 独立能力名，不按规则 id 猜实现；不同规则可以引用同一能力。 */
  validator: string;
  scope?: ScopeDeclaration;
  when?: Expression;
  requires?: ValidationPrerequisite[];
  /** Host 内部不透明的数据依赖；与 when 的可见读取合并失效，不等于每次变化立即请求。 */
  watch: DataReference[];
  /** 义务和结果的归属字段，不把它误认为唯一输入。 */
  target: DataReference;
}
/** 数据校验声明，不包含任务代次、Pending、结果或回调。 */
export type Constraint = InternalConstraint | ExternalConstraint;
/** 覆盖 Schema 某项检查的展示消息；动态数组成员复用同一声明，不按可变下标配置。 */
export interface SchemaMessageOverride {
  /** 相对根 data.schema 的声明引用，例如 #/properties/age。 */
  schemaRef: string;
  /** 对应校验关键字，例如 minimum；资源和关键字的关联由 Compiler 检查。 */
  keyword: string;
  message: MessageSpec;
}
