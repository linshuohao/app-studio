import type { JsonSchema } from '../common.js';
import type { EventContract } from './material.js';

/** Host Validator 调用快照 / Scope 接入版本，不包含命名参数映射、网络配置或实现函数。 */
export interface HostValidatorContract {
  contractVersion: string;
}
/** Host 接受的业务事件；Payload 契约复用事件数据结构，不表达等待返回。 */
export interface HostEventContract extends EventContract {
  /** true 仅用于明确可跳过的事件，如遥测；缺省不授权静默忽略。 */
  optional?: boolean;
}
/** Host 请求的静态输入输出签名；不包含网络配置、注册函数或取消句柄。 */
export interface HostRequestContract {
  payloadSchema: JsonSchema;
  resultSchema: JsonSchema;
}
/** 可选的宿主静态声明，用于增强编译检查；没有它不等于运行时实现必然缺失。 */
export interface HostContract {
  /** 按独立校验能力名登记契约，不按某个 Constraint id 绑定。 */
  validators?: Record<string, HostValidatorContract>;
  /** 按 host.emit 的业务事件名登记，与物料发出的事件名区分。 */
  events?: Record<string, HostEventContract>;
  /** 页面 host.request 所引用的应用能力；可由不同 Host 自行命名。 */
  requests?: Record<string, HostRequestContract>;
}
