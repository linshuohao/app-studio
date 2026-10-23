import type { ValueSpec } from './expression.js';
/** 将业务意图交给 Host；不描述网络或等待 Host 返回值的编排。 */
export interface HostEventIntent {
  type: 'host.emit';
  /** Host 业务事件名称，区别于 MaterialNode.on 字典中的物料事件名称。 */
  event: string;
  /** 触发时按调用求值；仅物料事件上下文允许 Event Reference，Reaction 不提供 Event。 */
  payload?: ValueSpec;
}
