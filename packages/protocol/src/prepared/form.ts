import type { PreparedCommand } from './command.js';
import type { PreparedExpression } from './expression.js';
import type { PreparedDependencyPlan, PreparedScopePattern } from './reference.js';
import type { CapabilityLock, HostRequirements } from './requirements.js';
import type { PreparedValidationPlan } from './validation.js';
import type { PreparedViewPlan } from './view.js';
export interface PreparedReaction {
  id: string;
  scopePatternId?: string;
  observationId: string;
  runOnActivate: boolean;
  when?: PreparedExpression;
  then: PreparedCommand[];
}
export interface PreparedFormPlan {
  scopes: Record<string, PreparedScopePattern>;
  expressions: Record<string, PreparedExpression>;
  reactions: Record<string, PreparedReaction>;
  validation: PreparedValidationPlan;
}
export interface PreparedIdentity {
  definitionId: string;
  definitionVersion: string;
  protocolVersion: string;
  compilerVersion: string;
  catalogSnapshotId: string;
  profile: string;
  platform: string;
}
export interface DefinitionSourceLocation {
  documentId: string;
  pointer: string;
}
/** Immutable reusable JSON artifact. Runtime consumes only its exact supported format. */
export interface PreparedForm {
  preparedFormatVersion: string;
  identity: PreparedIdentity;
  formPlan: PreparedFormPlan;
  viewPlan: PreparedViewPlan;
  dependencyPlan: PreparedDependencyPlan;
  capabilityLock: CapabilityLock;
  hostRequirements: HostRequirements;
  /** Prepared entity id to original definition location; not the full Compiler analysis graph. */
  sources?: Record<string, DefinitionSourceLocation[]>;
}
