import type { JsonValue } from '@form-engine/protocol';
import type { TypedRequest, RequestMap } from '../material/types.js';
import type { RequestInput, RequestOutput } from '../adapter/types.js';
/** 取消信号仅为 Web SDK 对象，不进入协议。Host 可以忽略。 */
export type HostRequestHandler<I = JsonValue, O = JsonValue> = (
  input: I,
  options: { readonly signal: AbortSignal },
) => O | Promise<O>;
// 注册的泛型处理函数在确定契约下使用；桥接先验证 unknown，再调用。
export type HostRequestRegistry = Readonly<Record<string, HostRequestHandler<never, unknown>>>;
/** 为 Schema 添加显式的请求输入 / 输出类型凭据，不发请求，不生成跨语言运行对象。 */
export function defineRequest<I extends JsonValue, O extends JsonValue>(
  contract: Omit<TypedRequest<I, O>, '__types'>,
): TypedRequest<I, O> {
  return Object.freeze(contract);
}
/** 返回固定处理函数字典：静态类型约束必需名称及签名，运行时再核对名称完整性。 */
export function defineHostRequests<C extends RequestMap>(
  contracts: C,
  handlers: {
    readonly [K in keyof C]: HostRequestHandler<RequestInput<C[K]>, RequestOutput<C[K]>>;
  },
): typeof handlers {
  for (const name of Object.keys(contracts))
    if (!Object.hasOwn(handlers, name) || typeof handlers[name] !== 'function')
      throw Error(`Missing Host request ${name}`);
  return Object.freeze({ ...handlers });
}
