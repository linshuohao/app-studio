import type { JsonPrimitive, JsonValue } from '../common.js';
import type { PreparedReference } from './reference.js';
/** Resolved typed tree. No original lexical names or Runtime dependency analysis. */
export type PreparedExpression =
  | { kind: 'constant'; value: JsonPrimitive }
  | { kind: 'literal'; value: JsonValue }
  | { kind: 'reference'; reference: PreparedReference }
  | { kind: 'expression'; expressionId: string }
  | { kind: 'call'; functionId: string; args: PreparedExpression[] };
/**
 * @propertyNames {"not":{"enum":["$expr","$literal"]}}
 */
export interface PreparedValueObject {
  [key: string]: PreparedValueSpec;
}
export type PreparedValueSpec =
  | JsonPrimitive
  | { $expr: PreparedExpression }
  | { $literal: JsonValue }
  | PreparedValueSpec[]
  | PreparedValueObject;
