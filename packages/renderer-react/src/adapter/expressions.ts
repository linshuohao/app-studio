import type {
  DataWatch,
  PreparedExpressionValue,
  PreparedValueSpec,
} from '@form-engine/protocol/prepared';
import type { FormRuntime, ReadResult, ReadonlyJson, ScopeBinding } from '@form-engine/runtime';
import type { JsonPrimitive, JsonValue } from '@form-engine/protocol';

/** 仅比较输入身份，不因每个物料的缓存而强持有旧的整表 / Context 根对象。 */
const inputIdentities = new WeakMap<object, symbol>();
type InputIdentity = JsonPrimitive | symbol;
type ComparedRead = ReadResult | { readonly kind: 'value'; readonly value: symbol };
function inputIdentity(value: ReadonlyJson): InputIdentity {
  if (value === null || typeof value !== 'object') return value;
  let identity = inputIdentities.get(value);
  if (!identity) inputIdentities.set(value, (identity = Symbol()));
  return identity;
}
function contextIdentity(runtime: FormRuntime): ComparedRead {
  const result = runtime.read({ source: 'context', path: '' });
  return result.kind === 'value' ? { kind: 'value', value: inputIdentity(result.value) } : result;
}
function isExpression(value: PreparedValueSpec): value is PreparedExpressionValue {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.hasOwn(value, '$expr') &&
    Object.hasOwn(value, 'watch')
  );
}
interface ExpressionEntry {
  readonly plan: PreparedExpressionValue;
  /** 求值依据的只读输入身份和 watch 投影；用于比较缓存，不保存可写业务状态。 */
  inputs?: {
    data: InputIdentity;
    context: ComparedRead;
    contextRefresh: number;
    dependencies: readonly ReadResult[];
  };
  /** 上次求值结果；不能用 truthy 判断 null / false / 0 是否可用。 */
  value?: JsonValue;
  /** 上次 Missing / 求值错误；复读时抛出，不能继续展示旧结果。 */
  error?: Error;
}
/** 与 Runtime 的值观察一致：保留 missing / error，值按 Object.is 比较。 */
function sameRead(previous: ComparedRead | undefined, current: ComparedRead): boolean {
  if (previous?.kind !== current.kind) return false;
  if (previous.kind === 'value' && current.kind === 'value')
    return Object.is(previous.value, current.value);
  if (previous.kind === 'error' && current.kind === 'error')
    return previous.error === current.error;
  return true;
}
/** 只走 Prepared 值容器识别完整包装；不分析表达式 AST / 依赖。 */
export class ExpressionProjection {
  /** Prepared 普通对象 / 数组到已组装结果的缓存，未变子项保留引用。 */
  readonly #containers = new WeakMap<object, JsonValue>();
  /** 只为完整 $expr 建条目；内部运算节点不单独登记观察。 */
  readonly #entries = new Map<PreparedExpressionValue, ExpressionEntry>();
  /** 同值标量 Context 没有新对象身份，靠管理通知保留显式替换的刷新语义。 */
  #contextRefresh = 0;
  #announcedContext?: ComparedRead;
  constructor(
    readonly plan: PreparedValueSpec,
    readonly runtime: FormRuntime,
    readonly scope: ScopeBinding,
  ) {
    const collect = (value: PreparedValueSpec) => {
      if (!value || typeof value !== 'object') return;
      if ('$literal' in value) return;
      if (isExpression(value)) {
        this.#entries.set(value, { plan: value });
        return;
      }
      Object.values(value).forEach(collect);
    };
    collect(plan);
  }
  /** 按 Compiler 给定 watch 建立观察，返回全部解除函数；构造本对象时不订阅。 */
  connect(changed: () => void): Array<() => void> {
    const disposers: Array<() => void> = [];
    try {
      if (this.#entries.size) {
        this.#announcedContext = contextIdentity(this.runtime);
        // 空 Data watch 只接收 Context 管理失效（及 Scope 退休），不响应普通 Data 修改。
        disposers.push(
          this.runtime.observe(
            [],
            () => {
              const context = contextIdentity(this.runtime);
              if (sameRead(this.#announcedContext, context)) this.#contextRefresh++;
              this.#announcedContext = context;
              changed();
            },
            this.scope,
          ).dispose,
        );
      }
      for (const entry of this.#entries.values()) {
        disposers.push(this.runtime.observe(entry.plan.watch, changed, this.scope).dispose);
      }
      return disposers;
    } catch (error) {
      disposers.forEach((dispose) => dispose());
      throw error;
    }
  }
  /**
   * 返回完整 Props 值树；输入未变直接复用，Data 改变时只重算 watch 投影有变化的表达式。
   * 通知只是催促复读：Host 可在本表达式回调之前重入 React，读取不能依赖回调先置 dirty。
   */
  read(): JsonValue {
    const frame = this.#entries.size
      ? {
          data: inputIdentity(this.runtime.snapshot()),
          context: contextIdentity(this.runtime),
          contextRefresh: this.#contextRefresh,
        }
      : undefined;
    const visit = (value: PreparedValueSpec): JsonValue => {
      if (!value || typeof value !== 'object') return value;
      if ('$literal' in value) return value.$literal!;
      if (isExpression(value)) {
        const entry = this.#entries.get(value)!;
        const previous = entry.inputs;
        const current = frame!;
        const contextChanged =
          !sameRead(previous?.context, current.context) ||
          previous?.contextRefresh !== current.contextRefresh;
        if (!previous || !Object.is(previous.data, current.data) || contextChanged) {
          const dependencies = entry.plan.watch.map((watch) => this.#readWatch(watch));
          if (
            !previous ||
            contextChanged ||
            dependencies.some((result, i) => !sameRead(previous.dependencies[i], result))
          ) {
            const result = this.runtime.evaluate(value.$expr!, this.scope);
            entry.error =
              result.kind === 'value'
                ? undefined
                : Error(
                    result.kind === 'error'
                      ? `Material expression error: ${result.error}`
                      : 'Material expression missing',
                  );
            entry.value = result.kind === 'value' ? (result.value as JsonValue) : undefined;
          }
          entry.inputs = { ...current, dependencies };
        }
        if (entry.error) throw entry.error;
        return entry.value!;
      }
      const next = Array.isArray(value)
        ? value.map(visit)
        : Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
      const previous = this.#containers.get(value);
      if (previous && typeof previous === 'object') {
        const keys = Object.keys(next);
        if (
          keys.length === Object.keys(previous).length &&
          keys.every(
            (key) =>
              Object.hasOwn(previous, key) &&
              Object.is(
                (previous as Record<string, JsonValue>)[key],
                (next as Record<string, JsonValue>)[key],
              ),
          )
        )
          return previous;
      }
      const captured = Object.freeze(next) as JsonValue;
      this.#containers.set(value, captured);
      return captured;
    };
    return visit(this.plan);
  }
  /** 只读取 Prepared watch，不分析 AST；结构观察比较成员身份 / 顺序而非整数组内容。 */
  #readWatch(watch: DataWatch): ReadResult {
    const result = this.runtime.read(watch, this.scope);
    if (watch.aspect !== 'structure' || result.kind !== 'value') return result;
    if (!Array.isArray(result.value)) return { kind: 'missing' };
    const members = this.runtime.bind({ from: watch, as: 'member', mode: 'each' }, this.scope);
    return {
      kind: 'value',
      value: JSON.stringify(members.map((binding) => binding.member!.member)),
    };
  }
}
