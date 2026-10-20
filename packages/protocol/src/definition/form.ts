import type { JsonSchema, JsonValue } from '../common.js';
import type { Command } from './command.js';
import type { Expression } from './expression.js';
import type { DataReference, ScopeDeclaration } from './reference.js';
import type { Constraint, SchemaMessageOverride } from './validation.js';
import type { ViewNode, ViewTemplate } from './view.js';
export interface Reaction {
  id: string;
  scope?: ScopeDeclaration;
  /** Explicit triggers; when/command reads are not silently added. */
  watch: DataReference[];
  when?: Expression;
  then: Command[];
  /** Default false. Only applies when a new rule instance is first established. */
  runOnActivate?: boolean;
}
/** Canonical author-controlled definition; Runtime consumes PreparedForm instead. */
export interface FormDefinition {
  protocolVersion: string;
  id: string;
  version: string;
  data: { schema: JsonSchema };
  expressions?: Record<string, Expression>;
  constraints?: Constraint[];
  reactions?: Reaction[];
  views: Record<string, ViewNode>;
  viewTemplates?: Record<string, ViewTemplate>;
  validationMessages?: SchemaMessageOverride[];
  metadata?: Record<string, JsonValue>;
}
