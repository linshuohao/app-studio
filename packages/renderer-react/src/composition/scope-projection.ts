import type { DataWatch, PreparedScopeDeclaration } from '@form-engine/protocol/prepared';
import type { FormRuntime, ScopeBinding } from '@form-engine/runtime';
import { canonical } from '../material/json.js';
/** 位置句柄的稳定编码；成员移动改变实际路径，但其 member 身份不变。 */
export const scopeKey = (scope: ScopeBinding) => canonical(scope);
/** 只缓存框架所需稳定绑定数组，成员目录与解析仍由 Runtime 管理。 */
export class ScopeProjection {
  /** 当前有效的绑定数组，缓存的是定位句柄，不是每行的业务数据。 */
  #snapshot: readonly ScopeBinding[] = [];
  constructor(
    readonly runtime: FormRuntime,
    readonly watches: readonly DataWatch[],
    readonly read: () => ScopeBinding[],
  ) {}
  /** 按当前 Runtime 展开位置，并复用未改变的绑定对象，供 React key / 依赖比较。 */
  getSnapshot = (): readonly ScopeBinding[] => {
    const next = this.read();
    if (canonical(next) === canonical(this.#snapshot)) return this.#snapshot;
    const previous = new Map(this.#snapshot.map((scope) => [scopeKey(scope), scope]));
    return (this.#snapshot = Object.freeze(
      next.map((scope) => previous.get(scopeKey(scope)) ?? scope),
    ));
  };
  /** 返回解除函数；注册后立即通知复读，补齐首次读取到注册之间的变化。 */
  subscribe = (listener: () => void, scope: ScopeBinding = {}) => {
    const observation = this.runtime.observe(this.watches, listener, scope);
    listener();
    return observation.dispose;
  };
}
/**
 * 创建 ScopeNode 的外部观察源，不是 Hook。
 * 输入为 Runtime、已准备的 Binder 与父词法 Scope；返回 getSnapshot / subscribe。
 * each 观察成员结构，one 观察位置值 / 存在性；实际成员身份与定位仍由 Runtime 产生。
 */
export function scopes(
  runtime: FormRuntime,
  declaration: PreparedScopeDeclaration,
  parent: ScopeBinding,
) {
  const binders = Array.isArray(declaration) ? declaration : [declaration];
  const projection = new ScopeProjection(
    runtime,
    binders.map((binder) => ({
      ...binder.from,
      aspect: binder.mode === 'each' ? 'structure' : 'value',
    })),
    () => runtime.bind(declaration, parent),
  );
  return {
    getSnapshot: projection.getSnapshot,
    subscribe: (listener: () => void) => projection.subscribe(listener, parent),
  };
}
