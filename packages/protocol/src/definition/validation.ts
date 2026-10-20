import type { MessageSpec } from '../common.js';
import type { Expression } from './expression.js';
import type { DataReference, ScopeDeclaration } from './reference.js';
/** Synchronous eligibility only; this is not complete field validity. */
export interface FieldPrerequisite {
  kind: 'field';
  target: DataReference;
  phase: 'sync';
}
/** Compiler rejects External targets, cycles, self-inclusion and ambiguous Scope binding. */
export interface ConstraintPrerequisite {
  kind: 'constraint';
  constraintId: string;
}
export type ValidationPrerequisite = FieldPrerequisite | ConstraintPrerequisite;
export interface IssueDefinition {
  target: DataReference;
  code: string;
  message?: MessageSpec;
}
export interface InternalConstraint {
  id: string;
  kind: 'internal';
  scope?: ScopeDeclaration;
  when?: Expression;
  requires?: ValidationPrerequisite[];
  assert: Expression;
  issue: IssueDefinition;
}
/** Host reads this invocation's snapshot/Scope; watch covers opaque data dependencies. */
export interface ExternalConstraint {
  id: string;
  kind: 'external';
  /** Independent capability name; never inferred from this rule's id. */
  validator: string;
  scope?: ScopeDeclaration;
  when?: Expression;
  requires?: ValidationPrerequisite[];
  watch: DataReference[];
  target: DataReference;
}
export type Constraint = InternalConstraint | ExternalConstraint;
/** schemaRef points into the root data schema, not a mutable array member path. */
export interface SchemaMessageOverride {
  schemaRef: string;
  keyword: string;
  message: MessageSpec;
}
