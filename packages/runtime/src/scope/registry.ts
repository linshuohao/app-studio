import type { JsonValue } from '@form-engine/protocol';
import type { DataReference } from '@form-engine/protocol/definition';
import type { PreparedScopeDeclaration } from '@form-engine/protocol/prepared';
import { readAt } from '../data/json.js';
import type { ScopeIndex } from './index.js';

/** Scope 定位：有 member 时 path 相对稳定成员，无 member 时 path 相对数据根。 */
export interface ScopeLocation {
  /** Runtime 分配的稳定数组成员 ID，不是业务 ID；缺省时从数据根定位。 */
  readonly member?: string;
  /** 相对 member 或数据根的 JSON Pointer；空字符串表示锚点自身。 */
  readonly path: string;
}
/** 词法别名 → 定位句柄；规则、表达式和物料实例通过别名复用同一成员身份。 */
export type ScopeBinding = Readonly<Record<string, ScopeLocation>>;
/** 同一数据版本的根与成员位置索引；数组移动只改变位置，不改变成员身份。 */
export interface ReadView {
  /** 数据所属的 Runtime 身份，用于区分不同实例的输入证明。 */
  readonly runtimeId: string;
  /** 此版本的数据根；后续修改另建根，读取方不能直接修改。 */
  readonly root: JsonValue;
  /** 此 Store 的有效数据修改次数；Context 替换与 flush 不改变它。 */
  readonly revision: number;
  /** 按父成员 / 相对集合 / 本层位置记录的不可变索引，绝对路径按需解析。 */
  readonly scopes: ScopeIndex;
  /** 当前提交是否改变可绑定位置的存在性 / 结构；标量值变化不需要协调规则实例。 */
  readonly topologyChanged: boolean;
}
/** 在指定版本中将稳定句柄解析为绝对路径；该版本中成员已删除时抛错。 */
export function resolveLocation(view: ReadView, location: ScopeLocation): string {
  if (!location.member) return location.path;
  const base = view.scopes.memberPath(location.member);
  if (base === undefined) throw Error('scope: member is no longer alive');
  return base + location.path;
}
/** 先解析作用域别名的锚点，再拼接引用路径；无 scope 时直接使用绝对 Pointer。 */
export function resolvePath(
  view: ReadView,
  reference: DataReference,
  binding: ScopeBinding = {},
): string {
  if (!reference.scope) return reference.path;
  const location = binding[reference.scope];
  if (!location) throw Error('scope: unknown lexical binding');
  return resolveLocation(view, location) + reference.path;
}
/**
 * 按声明顺序扩展父绑定：each 为每个数组成员建稳定绑定，其他模式绑定一个存在的位置。
 * 目标缺失或父 Scope 失效时不产生实例；仅返回定位句柄，不复制业务数据。
 */
export function bindScopes(
  view: ReadView,
  declaration?: PreparedScopeDeclaration,
  parent: ScopeBinding = {},
): ScopeBinding[] {
  let bindings = [parent];
  for (const binder of declaration
    ? Array.isArray(declaration)
      ? declaration
      : [declaration]
    : []) {
    bindings = bindings.flatMap((binding) => {
      let path: string;
      try {
        path = resolvePath(view, binder.from, binding);
      } catch {
        return [];
      }
      if (binder.mode === 'each') {
        return (view.scopes.membersOf(path) ?? []).map((member) =>
          Object.freeze({ ...binding, [binder.as]: Object.freeze({ member, path: '' }) }),
        );
      }
      if (readAt(view.root, path).kind === 'missing') return [];
      const anchor = binder.from.scope ? binding[binder.from.scope] : undefined;
      const location = anchor ? { ...anchor, path: anchor.path + binder.from.path } : { path };
      return [Object.freeze({ ...binding, [binder.as]: Object.freeze(location) })];
    });
  }
  return bindings;
}
/** 将别名及成员 / 相对路径编码为实例键；成员移动不改变键，用于保留规则实例。 */
export function bindingKey(binding: ScopeBinding): string {
  return JSON.stringify(
    Object.entries(binding).map(([alias, value]) => [alias, value.member ?? '', value.path]),
  );
}
/** 检查绑定引用的成员身份是否仍存活；不证明普通对象路径或字段当前存在。 */
export function bindingAlive(view: ReadView, binding: ScopeBinding): boolean {
  return Object.values(binding).every(
    (location) => !location.member || view.scopes.alive(location.member),
  );
}
/** 解析数组 Command 的成员锚点，要求别名指向目标数组的直接成员并返回当前下标。 */
export function memberIndex(
  view: ReadView,
  path: string,
  alias: string,
  binding: ScopeBinding,
): number {
  const location = binding[alias];
  if (!location?.member || location.path !== '')
    throw Error('scope: array operation requires a member handle');
  const index = view.scopes.memberIndex(path, location.member);
  if (index < 0) throw Error('scope: member does not belong to target array');
  return index;
}
