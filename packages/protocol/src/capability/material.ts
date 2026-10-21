import type { JsonSchema } from '../common.js';

/** 某个具名 Binding 预期的数据形状；用于静态连接检查，不是 Runtime 写入权限或业务合法性门禁。 */
export interface BindingContract {
  schema: JsonSchema;
}
/** 物料对配置暴露的事件数据契约；不描述处理结果返回值或异步调用链。 */
export interface EventContract {
  /** 省略表示无配置可读 Payload 的通知；存在时供 Compiler 检查 Event Reference 路径及类型。 */
  payloadSchema?: JsonSchema;
}
/** 有返回值的物料交互契约；名称属于物料，与 Host 实现名称无关。 */
export interface RequestContract {
  /** 物料发起请求提供的 JSON 数据；没有输入时可声明 null。 */
  payloadSchema: JsonSchema;
  /** 物料消费的 JSON 业务结果，不包含桥接层的 success / error / discarded 包装。 */
  resultSchema: JsonSchema;
  /** 同一挂载实例、同一请求名的并发策略；默认 latest，parallel 各次独立交付。 */
  concurrency?: 'latest' | 'parallel';
}
/** 物料的可序列化声明。Compiler 只读契约，不加载 UI 实现来推断能力。 */
export interface MaterialManifest {
  /** 稳定逻辑物料名，与视图中的 material 对应。 */
  id: string;
  /** 物料语义 / 契约版本，实际平台实现另由制品身份锁定。 */
  version: string;
  /** 求值后的 Props 应满足的模型；不包含 Binding、Slots 或当前组件状态。 */
  propsSchema?: JsonSchema;
  /** 物料接受的 Binding 名及数据形状，不区分 read / write。 */
  bindings?: Record<string, BindingContract>;
  /**
   * 允许的槽位名称；默认槽位使用 default，只限制名称，不设置通用节点数量规则。
   * @uniqueItems true
   */
  slots?: string[];
  /** 配置 on 映射可以使用的语义事件，不登记组件内部全部回调或指令调用。 */
  events?: Record<string, EventContract>;
  /** 可由页面映射到 Host 的请求；声明本身不强制每个页面都配置映射。 */
  requests?: Record<string, RequestContract>;
}
