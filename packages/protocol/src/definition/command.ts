import type { ValueSpec } from './expression.js';
import type { DataReference, ScopeHandleReference } from './reference.js';
export interface IndexPosition {
  kind: 'index';
  /** Final index for move; 0..length for insert. Bounds use execution-time data.
   * @minimum 0
   * @asType integer
   */
  index: number;
}
export interface BeforePosition {
  kind: 'before';
  item: ScopeHandleReference;
}
export interface AfterPosition {
  kind: 'after';
  item: ScopeHandleReference;
}
export type ArrayPosition = IndexPosition | BeforePosition | AfterPosition;
/** Replace the value at a writable location; business validity is checked separately. */
export interface SetCommand {
  op: 'set';
  target: DataReference;
  value: ValueSpec;
}
/** Shallow patch, not a recursive merge. */
export interface PatchCommand {
  op: 'patch';
  target: DataReference;
  value: Record<string, ValueSpec>;
}
export interface RemoveCommand {
  op: 'remove';
  target: DataReference;
}
export interface ArrayInsertCommand {
  op: 'array.insert';
  target: DataReference;
  position: ArrayPosition;
  value: ValueSpec;
}
export interface ArrayRemoveCommand {
  op: 'array.remove';
  target: DataReference;
  item: ScopeHandleReference;
}
/** The member identity is retained; an invalid destination must not leave a partial removal. */
export interface ArrayMoveCommand {
  op: 'array.move';
  target: DataReference;
  item: ScopeHandleReference;
  position: ArrayPosition;
}
/** Ordered and non-atomic: a later failure does not roll back earlier successful commands. */
export interface BatchCommand {
  op: 'batch';
  commands: Command[];
}
export type Command =
  | SetCommand
  | PatchCommand
  | RemoveCommand
  | ArrayInsertCommand
  | ArrayRemoveCommand
  | ArrayMoveCommand
  | BatchCommand;
