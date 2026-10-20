import type { JsonPrimitive, JsonValue } from '../common.js';
import type { Reference } from './reference.js';
export interface ReferenceExpression {
  ref: Reference;
}
export interface NamedExpression {
  use: string;
}
export interface CallExpression {
  op: string;
  args: Expression[];
}
export interface LiteralExpression {
  literal: JsonValue;
}
export type Expression =
  JsonPrimitive | ReferenceExpression | NamedExpression | CallExpression | LiteralExpression;
export interface ExpressionValue {
  $expr: Expression;
}
/** The enclosed JSON is not recursively interpreted as ValueSpec. */
export interface LiteralValue {
  $literal: JsonValue;
}
/**
 * Ordinary object keys exclude the two protocol wrappers.
 * @propertyNames {"not":{"enum":["$expr","$literal"]}}
 */
export interface ValueObject {
  [key: string]: ValueSpec;
}
export type ValueSpec = JsonPrimitive | ExpressionValue | LiteralValue | ValueSpec[] | ValueObject;
