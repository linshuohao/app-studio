import type { PreparedValueSpec } from './expression.js';
import type { PreparedDataReference, PreparedScopeHandle } from './reference.js';
export interface PreparedIndexPosition {
  kind: 'index';
  /** @minimum 0
   * @asType integer
   */
  index: number;
}
export type PreparedArrayPosition =
  | PreparedIndexPosition
  | { kind: 'before'; item: PreparedScopeHandle }
  | { kind: 'after'; item: PreparedScopeHandle };
export type PreparedCommand =
  | { op: 'set'; target: PreparedDataReference; value: PreparedValueSpec }
  | { op: 'patch'; target: PreparedDataReference; value: Record<string, PreparedValueSpec> }
  | { op: 'remove'; target: PreparedDataReference }
  | {
      op: 'array.insert';
      target: PreparedDataReference;
      position: PreparedArrayPosition;
      value: PreparedValueSpec;
    }
  | { op: 'array.remove'; target: PreparedDataReference; item: PreparedScopeHandle }
  | {
      op: 'array.move';
      target: PreparedDataReference;
      item: PreparedScopeHandle;
      position: PreparedArrayPosition;
    }
  | { op: 'batch'; commands: PreparedCommand[] };
