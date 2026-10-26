import type { ReadView, ScopeLocation } from '../scope/registry.js';
import { resolveLocation } from '../scope/registry.js';

/** 将问题路径锚定到该路径经过的最深数组成员，移动后仍能跟随同一成员。 */
export function fieldLocation(view: ReadView, path: string): ScopeLocation {
  return Object.freeze(view.scopes.locate(path));
}
/** 在当前版本解析问题位置；成员已删除时返回 undefined，聚合时不再展示该问题。 */
export function currentFieldPath(view: ReadView, field: ScopeLocation): string | undefined {
  try {
    return resolveLocation(view, field);
  } catch {
    return undefined;
  }
}
