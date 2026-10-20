/** Static pattern id. Runtime member Scope IDs are never serialized here. */
export type ScopePatternId = string;
export type PreparedDataReference =
  | { source: 'data'; base: 'root'; path: string[] }
  | { source: 'data'; base: 'scope'; scopePatternId: ScopePatternId; path: string[] };
export type PreparedReference =
  | PreparedDataReference
  | { source: 'context'; path: string[] }
  | { source: 'event'; path: string[] };
export interface PreparedScopeHandle {
  scopePatternId: ScopePatternId;
}
export interface PreparedScopePattern {
  id: ScopePatternId;
  parentId?: ScopePatternId;
  from: PreparedDataReference;
  mode: 'one' | 'each';
}
export type PreparedDependency =
  | { source: 'data'; reference: PreparedDataReference; aspect: 'value' | 'structure' }
  | { source: 'validation'; reference: PreparedDataReference }
  | { source: 'field-meta'; reference: PreparedDataReference };
export interface PreparedObservation {
  id: string;
  owner: { kind: 'reaction' | 'constraint' | 'view'; id: string };
  dependencies: PreparedDependency[];
  scopePatternId?: ScopePatternId;
  activationOwner: 'runtime' | 'view-mounted';
}
export interface PreparedDependencyPlan {
  observations: Record<string, PreparedObservation>;
}
