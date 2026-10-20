import type { PreparedCommand } from './command.js';
import type { PreparedValueSpec } from './expression.js';
import type { PreparedDataReference } from './reference.js';
export type PreparedInteractionIntent =
  | { type: 'form.command'; command: PreparedCommand }
  | { type: 'host.emit'; event: string; payload?: PreparedValueSpec };
/** Templates are expanded at compile time; no TemplateUse branch remains. */
export type PreparedViewNode = PreparedMaterialNode | PreparedScopeNode;
export interface PreparedMaterialNode {
  kind: 'material';
  id: string;
  materialId: string;
  props: Record<string, PreparedValueSpec>;
  bindings: Record<string, PreparedDataReference>;
  slots: Record<string, PreparedViewNode[]>;
  on: Record<string, PreparedInteractionIntent>;
  observationId?: string;
}
export interface PreparedScopeNode {
  kind: 'scope';
  id: string;
  scopePatternId: string;
  node: PreparedViewNode;
}
export interface PreparedViewPlan {
  root: PreparedViewNode;
}
