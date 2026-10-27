import type { ReactNode } from 'react';
import type { JsonValue } from '@form-engine/protocol';
import type { Command } from '@form-engine/protocol/definition';
import type { CommandResult, FieldValidation, ReadResult } from '@form-engine/runtime';
import type { MaterialContract, RequestMap, TypedRequest } from '../material/types.js';
/** 同步交付结果：executed 仍须检查 Runtime result.ok，inactive 表示旧关联不可再调用。 */
export type AdapterActionResult =
  | { readonly kind: 'executed'; readonly result: CommandResult }
  | { readonly kind: 'inactive' }
  | { readonly kind: 'error'; readonly error: string };
/** 一次请求的终态；discarded 是资格撤销，不代表网络已经物理终止。 */
export type RequestResult<O> =
  | { readonly status: 'success'; readonly value: O }
  | {
      readonly status: 'error';
      readonly error: { readonly code: string; readonly message?: string };
    }
  | { readonly status: 'discarded' };
/** 每次调用独立返回的本地句柄，不属于协议 JSON 或表单业务状态。 */
export interface RequestCall<O> {
  /** 总会交付该次调用的终态；成功值由物料消费，不自动写回 Runtime。 */
  readonly result: Promise<RequestResult<O>>;
  /** 幂等撤销交付资格并立即 discarded，再尽力取消底层请求。 */
  readonly cancel: () => void;
}
export type RequestInput<T> = T extends TypedRequest<infer I, JsonValue> ? I : never;
export type RequestOutput<T> = T extends TypedRequest<JsonValue, infer O> ? O : never;
/**
 * 共用 Hook 的返回契约。P / B / E / R 分别限定 Props、Binding 名、事件及请求。
 * 这些类型描述接入能力，不保证当前 Working Data 已经通过 Schema 校验。
 */
export interface MaterialAdapter<
  P extends object,
  B extends string,
  E extends Record<string, JsonValue | undefined>,
  R extends RequestMap,
> {
  /** Prepared Props 中的完整表达式经 Runtime 求值后的当前配置。 */
  readonly props: Readonly<P>;
  /** 来自 Runtime 的具名 Binding 读取结果；missing 与合法 null / 空串分开。读错误进入错误边界。 */
  readonly values: Readonly<Record<B, ReadResult>>;
  /** Binding 当前的聚合 status / issues；只读投影，不是完整提交证明。 */
  readonly validation: Readonly<Record<B, FieldValidation>>;
  /** Renderer 构造的具名 React 元素；容器返回它们之后，子物料才实际挂载。 */
  readonly slots: Readonly<Record<string, ReactNode>>;
  /** 将原样 JSON 值交给具名 Binding，允许暂时业务不合法值；不额外发一次 change 事件。 */
  readonly set: (name: B, value: JsonValue) => AdapterActionResult;
  /** 在当前 Scope 执行已有 Command；batch 保持逐条生效、非原子。 */
  readonly command: (command: Command) => AdapterActionResult;
  /** 触发节点 on 中的无返回通知映射；Host 异步业务不在这里等待。 */
  readonly emit: <K extends keyof E & string>(name: K, payload?: E[K]) => AdapterActionResult;
  /** 发起有结果的交互并返回该次 RequestCall；输入 / 输出、并发及存活资格由桥接检查。 */
  readonly request: <K extends keyof R & string>(
    name: K,
    input: RequestInput<R[K]>,
  ) => RequestCall<RequestOutput<R[K]>>;
}
export type AdapterFor<C> =
  C extends MaterialContract<infer P, infer B, infer E, infer R>
    ? MaterialAdapter<P, B, E, R>
    : never;
