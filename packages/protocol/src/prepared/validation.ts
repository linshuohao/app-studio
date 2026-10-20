import type { JsonSchema, MessageSpec } from '../common.js';
import type { PreparedExpression } from './expression.js';
import type { PreparedDataReference } from './reference.js';
/** Local, immutable closure. No Runtime remote $ref fetching or JS functions. */
export interface PreparedSchemaResource {
  schema: JsonSchema;
}
export type PreparedPrerequisite =
  | { kind: 'constraint'; constraintId: string }
  | { kind: 'field'; target: PreparedDataReference; phase: 'sync'; constraintIds: string[] };
export type PreparedConstraintExecutor =
  | { kind: 'internal'; assert: PreparedExpression; code: string; message?: MessageSpec }
  | { kind: 'external'; validator: string };
export interface PreparedConstraint {
  id: string;
  scopePatternId?: string;
  when?: PreparedExpression;
  target: PreparedDataReference;
  executor: PreparedConstraintExecutor;
  prerequisites: PreparedPrerequisite[];
  observationId: string;
}
export interface PreparedSchemaMessage {
  resourceId: string;
  schemaPath: string;
  keyword: string;
  message: MessageSpec;
}
export interface PreparedValidationPlan {
  rootSchemaResourceId: string;
  schemaResources: Record<string, PreparedSchemaResource>;
  constraints: Record<string, PreparedConstraint>;
  messages: PreparedSchemaMessage[];
}
