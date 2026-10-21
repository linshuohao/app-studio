import type { JsonPrimitive, JsonValue } from '../common.js';
import type { PreparedReference } from './reference.js';
/**
 * 已解析身份和引用的执行树；与作者 Expression 分离，不在 Runtime 重新分析原始声明。
 * expressionId 指向 formPlan.expressions，functionId 指向已锁定的函数；局部实例由执行上下文绑定。
 */
export type PreparedExpression =
  | { kind: 'constant'; value: JsonPrimitive }
  | { kind: 'literal'; value: JsonValue }
  | { kind: 'reference'; reference: PreparedReference }
  | { kind: 'expression'; expressionId: string }
  | { kind: 'call'; functionId: string; args: PreparedExpression[] };
/**
 * 普通准备值对象，属性继续递归；保留键必须走严格包装，不允许通过字典分支接住非法包装。
 * @propertyNames {"not":{"enum":["$expr","$literal"]}}
 */
export interface PreparedValueObject {
  [key: string]: PreparedValueSpec;
}
/**
 * 编译后的递归 Props / 命令值 / Host Payload，保持原 Literal 原文，动态部分只保存 PreparedExpression。
 * 虽然包装与 ValueSpec 相近，内部执行引用已经不同，不复用同一作者侧类型或通用泛型树。
 */
export type PreparedValueSpec =
  | JsonPrimitive
  | { $expr: PreparedExpression }
  | { $literal: JsonValue }
  | PreparedValueSpec[]
  | PreparedValueObject;
