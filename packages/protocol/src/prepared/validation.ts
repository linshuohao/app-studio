import type { JsonSchema, MessageSpec } from '../common.js';
import type { PreparedExpression } from './expression.js';
import type { PreparedDataReference } from './reference.js';
/** 随制品交付的不可变 Schema 资源。资源表应闭合所有必要引用，不在执行时联网补资源。 */
export interface PreparedSchemaResource {
  /** 标准 Schema 原文，不携带 Ajv 生成函数，也不拆成 Keyword 局部执行器。 */
  schema: JsonSchema;
}
/**
 * 编译解析后的同步资格依赖。constraintId / constraintIds 指向本计划的 Constraint 声明，
 * Runtime 再结合当前 Scope 绑定唯一规则实例；根 Schema 检查不按每条前置重复补入。
 */
export type PreparedPrerequisite =
  | { kind: 'constraint'; constraintId: string }
  | {
      kind: 'field';
      target: PreparedDataReference;
      phase: 'sync';
      /** 编译解析出的相关 Internal 集合，不包含 External；必须结合字段 Schema 结论判断资格。 */
      constraintIds: string[];
    };
/** 规则执行方式；Internal assert 产生 boolean，External 只引用 Host 能力，不序列化其函数。 */
export type PreparedConstraintExecutor =
  | { kind: 'internal'; assert: PreparedExpression; code: string; message?: MessageSpec }
  | { kind: 'external'; validator: string };
/** 静态业务规则准备信息；不包含当前结果、请求代次、Pending 或 cancel 回调。 */
export interface PreparedConstraint {
  id: string;
  scopePatternId?: string;
  /** 准备后的适用条件；省略表示没有额外条件，不能把求值异常视为 false。 */
  when?: PreparedExpression;
  /** Issue / 校验义务归属位置，不自动等于规则全部输入。 */
  target: PreparedDataReference;
  executor: PreparedConstraintExecutor;
  /** 必须使用本轮同步结论；禁止自包含 / 环和跨 External 等待由 Compiler 检查。 */
  prerequisites: PreparedPrerequisite[];
  /** 对应 dependencyPlan 中的失效观察，含编译可推导的前置依赖补全。 */
  observationId: string;
}
/** 已定位到具体 Schema 资源的消息覆盖；不参与校验真假判断。 */
export interface PreparedSchemaMessage {
  resourceId: string;
  /** Schema 声明位置，不是当前成员的数据下标路径。 */
  schemaPath: string;
  keyword: string;
  message: MessageSpec;
}
/** 完整根 Schema 与 Constraint 计划；业务数据和聚合 Issues 留在每个 Runtime 实例内。 */
export interface PreparedValidationPlan {
  /** schemaResources 中本表单业务根 Schema 的键。 */
  rootSchemaResourceId: string;
  /** 固定的本地资源闭包；引用存在性和闭合性不是简单结构校验能证明的。 */
  schemaResources: Record<string, PreparedSchemaResource>;
  constraints: Record<string, PreparedConstraint>;
  messages: PreparedSchemaMessage[];
}
