import type { JsonPrimitive } from '../common.js';
import type { Expression, LiteralValue, ValueSpec } from '../definition/expression.js';
import type { DataWatch } from './reference.js';

/** 保留 op / args、ref、use 和 literal，不生成代码、能力编号或另一套求值指令。 */
export type PreparedExpression = Expression;

/**
 * 持续呈现的完整表达式及其静态依赖。空 watch 表示分析完成且没有 Data 观察项。
 * 内部递归运算子不单独订阅；Adapter 绑定当前 Scope，并独立管理失效与有效结果。
 * watch 仅在该严格包装内是编译信息，普通业务对象的同名属性不受限制。
 */
export interface PreparedExpressionValue {
  $expr: PreparedExpression;
  watch: DataWatch[];
}
/**
 * 普通 Props 对象继续递归；$expr / $literal 必须使用严格包装，不能落入字典分支。
 * @propertyNames {"not":{"enum":["$expr","$literal"]}}
 */
export type PreparedValueObject = {
  [key: string]: PreparedValueSpec;
} & {
  $expr?: never;
  $literal?: never;
};
/** 动态 Props 的递归值；Literal 原样保留，求值结果不再作为协议解释。 */
export type PreparedValueSpec =
  | JsonPrimitive
  | PreparedExpressionValue
  | LiteralValue
  | PreparedValueSpec[]
  | PreparedValueObject;

/** 事件 / 请求 Payload 和 Command 值按调用求值，不附加持续观察 watch。 */
export type PreparedOnDemandValueSpec = ValueSpec;
