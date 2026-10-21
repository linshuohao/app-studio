import type { JsonPrimitive, JsonValue } from '../common.js';
import type { Reference } from './reference.js';
/** 读取声明位置的当前值；读取本身不建立订阅。 */
export interface ReferenceExpression {
  ref: Reference;
}
/** 复用 FormDefinition.expressions 中的具名表达式；Compiler 检查引用与循环。 */
export interface NamedExpression {
  /** 定义内名称；被引用表达式不能隐式捕获调用者局部 Scope。 */
  use: string;
}
/** 同步纯计算调用，不允许 I/O、写 Data 或任意脚本。 */
export interface CallExpression {
  /** Canonical 使用确定的能力名，如 core.gte；Authoring 短名需先按白名单规范化。 */
  op: string;
  /** 有序参数；签名及内置短路语义由 Compiler / 执行器落实。 */
  args: Expression[];
}
/** AST 位置的原样 JSON 值；内部对象不再按 ref / use / op 等字段解析。 */
export interface LiteralExpression {
  literal: JsonValue;
}
/** 作者侧计算树。求值失败不等同于返回 false；可能读取集合由使用位置决定如何参与依赖。 */
export type Expression =
  JsonPrimitive | ReferenceExpression | NamedExpression | CallExpression | LiteralExpression;
/** 在递归 ValueSpec 中显式进入表达式语法；不能和其他对象字段混用。 */
export interface ExpressionValue {
  $expr: Expression;
}
/** ValueSpec 位置的原样 JSON 包装；内部不递归解释，允许存放含保留键的真实业务数据。 */
export interface LiteralValue {
  $literal: JsonValue;
}
/**
 * 属性值仍递归为 ValueSpec 的普通对象。保留键只能出现在相应的严格包装分支，不能降级为普通键。
 * @propertyNames {"not":{"enum":["$expr","$literal"]}}
 */
export interface ValueObject {
  [key: string]: ValueSpec;
}
/** Props、Command 值及 Host Payload 的递归配置；只在这些规定位置解析，不扫描 Working Data。 */
export type ValueSpec = JsonPrimitive | ExpressionValue | LiteralValue | ValueSpec[] | ValueObject;
