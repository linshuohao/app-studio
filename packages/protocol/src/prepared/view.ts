import type { JsonSchema } from '../common.js';
import type { PreparedCommand } from './command.js';
import type { PreparedValueSpec } from './expression.js';
import type { PreparedDataReference } from './reference.js';
/** 事件发生后执行的准备好意图；读取 Payload 不会把数据变化转换成事件触发。 */
export type PreparedInteractionIntent =
  | { type: 'form.command'; command: PreparedCommand }
  | { type: 'host.emit'; event: string; payload?: PreparedValueSpec };
/** 已解析的一次请求；所有 Schema 引用均指向本 View Plan 的 requestSchemas。 */
export interface PreparedHostRequestIntent {
  type: 'host.request';
  request: string;
  /** 省略时原样转发物料 Payload，不沿用 host.emit 的省略语义。 */
  payload?: PreparedValueSpec;
  /** Compiler 将物料声明的默认 latest 显式化。 */
  concurrency: 'latest' | 'parallel';
  /** 物料输入 / 期望结果的契约资源 ID，不是业务数据 Pointer。 */
  payloadSchemaRef: string;
  resultSchemaRef: string;
  /** 仅提供了 Host 静态契约时记录；有值时必须能在资源表中解析。 */
  hostPayloadSchemaRef?: string;
  hostResultSchemaRef?: string;
}
/** 编译已展开模板，只剩物料与 Scope 包装，不让 Renderer 再解释 TemplateUse。 */
export type PreparedViewNode = PreparedMaterialNode | PreparedScopeNode;
/** 供共用 Adapter 装配的静态物料节点，不包含组件对象、DOM 或局部 UI 状态。 */
export interface PreparedMaterialNode {
  kind: 'material';
  /** 准备后的节点身份，用于观察及来源定位；不是框架组件实例 ID。 */
  id: string;
  /** 能力锁中的物料逻辑 ID，由装配层关联目标实现。 */
  materialId: string;
  /** 尚待 Runtime 按当前输入求值的配置，不是预先计算的某个用户值。 */
  props: Record<string, PreparedValueSpec>;
  bindings: Record<string, PreparedDataReference>;
  /** 槽位仍为具名数组；未配置的集合在准备后显式为空字典。 */
  slots: Record<string, PreparedViewNode[]>;
  on: Record<string, PreparedInteractionIntent>;
  /** 未配置的请求映射归一化为空字典。 */
  requests: Record<string, PreparedHostRequestIntent>;
  /** 挂载时关联的静态观察；省略表示本节点没有关联条目，不隐含首次执行行为。 */
  observationId?: string;
}
/** 将子树关联到静态 Scope 模式，实际成员及挂载生命周期由 Runtime / Adapter 承接。 */
export interface PreparedScopeNode {
  kind: 'scope';
  id: string;
  scopePatternId: string;
  node: PreparedViewNode;
}
/** 当前 Profile 的准备视图闭包；Profile 选择不裁剪共享业务约束与数据模型。 */
export interface PreparedViewPlan {
  /** 请求边界使用的闭合 Schema 资源，不进入字段校验计划及 Pending。 */
  requestSchemas: Record<string, JsonSchema>;
  root: PreparedViewNode;
}
