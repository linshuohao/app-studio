/** JSON Pointer: empty string is the root; '/' addresses an empty property name.
 * @pattern ^(?:/(?:[^~/]|~[01])*)*$
 */
export type JsonPointer = string;
/** A lexical data location, not a snapshot value or runtime member identity. */
export interface DataReference {
  source: 'data';
  path: JsonPointer;
  scope?: string;
}
export interface ContextReference {
  source: 'context';
  path: JsonPointer;
}
/** Only valid while processing the material event that supplied this payload. */
export interface EventReference {
  source: 'event';
  path: JsonPointer;
}
export type Reference = DataReference | ContextReference | EventReference;
export interface ScopeBinder {
  from: DataReference;
  as: string;
  mode?: 'one' | 'each';
}
/** Ordered lexical bindings. Scope visibility/order is checked by the Compiler. */
export type ScopeDeclaration = ScopeBinder | [ScopeBinder, ...ScopeBinder[]];
/** Stable member identity resolved through a visible lexical scope. */
export interface ScopeHandleReference {
  $scope: string;
}
