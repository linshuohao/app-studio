import type { Command } from './command.js';
import type { ValueSpec } from './expression.js';
import type { DataReference, ScopeBinder } from './reference.js';
/** 在物料事件发生时执行数据命令，不因命令值读取变化而自动触发。 */
export interface CommandIntent {
  type: 'form.command';
  command: Command;
}
/** 将业务意图交给 Host；不描述网络或等待 Host 返回值的编排。 */
export interface HostEventIntent {
  type: 'host.emit';
  /** Host 业务事件名称，区别于 MaterialNode.on 字典中的物料事件名称。 */
  event: string;
  /** 事件发生时求值；可读取当次允许的 Event Reference。 */
  payload?: ValueSpec;
}
/** 对配置开放的两类事件响应；物料内部 Binding 写入不必重复映射成 on.change。 */
export type InteractionIntent = CommandIntent | HostEventIntent;
/** 一次物料请求到 Host 的映射，与无返回值的 on 通知分开。 */
export interface HostRequestIntent {
  type: 'host.request';
  /** Host 注册名称，不要求与物料请求名一致。 */
  request: string;
  /** 本次调用时求值，可读取 event Payload；省略时原样转发物料 Payload。 */
  payload?: ValueSpec;
}
/** 使用一个物料的作者侧视图节点；不携带组件实现或当前运行状态。 */
export interface MaterialNode {
  /** 逻辑物料 ID；版本与目标实现由确定 Catalog / 能力锁解析。 */
  material: string;
  /** 动态 / 静态 Props，最终值须满足物料 Props 契约。 */
  props?: Record<string, ValueSpec>;
  /** 物料声明的具名数据位置，可单字段或多字段；不声明读写权限。 */
  bindings?: Record<string, DataReference>;
  /** 物料接受的槽位名到子节点数组；默认槽位名为 default，没有通用数量限制。 */
  slots?: Record<string, ViewNode[]>;
  /** 物料语义事件名到响应；Payload 形状来自该物料的 EventContract。 */
  on?: Record<string, InteractionIntent>;
  /** 物料请求名到 Host 映射；声明请求漏映射由 Compiler 报错，无请求物料可省略。 */
  requests?: Record<string, HostRequestIntent>;
}
/** 显式建立视图词法上下文；each 模式重复实例化子视图，不另加 repeat。 */
export interface ScopeNode {
  scope: ScopeBinder;
  node: ViewNode;
}
/** 编译期静态模板复用；不是动态组件实例查找或 DOM 替换。 */
export interface TemplateUse {
  /** viewTemplates 中的名称，循环 / 缺失引用由 Compiler 诊断。 */
  $use: string;
  /** 模板形参到调用方可见 Data Reference 的映射，不隐式捕获其他 Scope。 */
  with?: Record<string, DataReference>;
}
/** Canonical 视图只包含物料、Scope 包装和静态模板使用三类节点。 */
export type ViewNode = MaterialNode | ScopeNode | TemplateUse;
/** 模板参数只引入可定位的数据位置，其类型复用业务 data.schema。 */
export interface TemplateDataParam {
  /** 相对根 data.schema 的声明引用，例如 #/$defs/Insured。 */
  schemaRef: string;
}
/** 供不同布局静态复用的节点结构，不建立独立数据域。 */
export interface ViewTemplate {
  params?: Record<string, TemplateDataParam>;
  node: ViewNode;
}
