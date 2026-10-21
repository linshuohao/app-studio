import type {
  HostRequestIntent,
  InteractionIntent,
  MaterialNode,
  ScopeNode,
  TemplateUse,
  ViewTemplate,
} from '../definition/view.js';
import type { PreparedValueSpec } from './expression.js';
import type { PreparedScopeBinder } from './reference.js';

/** 事件仍是 Command 或无返回 Host 通知；Payload 按调用求值，不持续订阅。 */
export type PreparedInteractionIntent = InteractionIntent;
/** 请求映射只增加执行所需的确定策略和契约引用，不改变 Host 调用语义。 */
export interface PreparedHostRequestIntent extends HostRequestIntent {
  /** 来自物料声明，缺省策略 latest 在输出中明确保存。 */
  concurrency: 'latest' | 'parallel';
  /** 指向 PreparedForm.resources.requestSchemas，而不是业务数据 Pointer。 */
  payloadSchemaRef: string;
  resultSchemaRef: string;
  /** 仅在提供 Host 静态契约时保存，引用存在性由 Compiler 检查。 */
  hostPayloadSchemaRef?: string;
  hostResultSchemaRef?: string;
}
/** 保留 material、bindings、slots、on 和 requests 的领域形状。 */
export interface PreparedMaterialNode extends Omit<MaterialNode, 'props' | 'slots' | 'requests'> {
  /** 静态节点身份，用于请求需求与来源关联；不是组件实例或 Runtime Scope ID。 */
  id: string;
  /** 每个完整 $expr 带独立 watch，不使用节点合并后全量重算。 */
  props?: Record<string, PreparedValueSpec>;
  slots?: Record<string, PreparedViewNode[]>;
  /** 无请求物料可省略；所用物料的必需映射完整性由 Compiler 检查。 */
  requests?: Record<string, PreparedHostRequestIntent>;
}
/** Binder 和别名保留，each 真实成员由 Runtime 管理。 */
export interface PreparedScopeNode extends Omit<ScopeNode, 'node' | 'scope'> {
  scope: PreparedScopeBinder;
  node: PreparedViewNode;
}
/** 保留静态模板调用及参数，Renderer 只做参数 / Scope 绑定与实例化。 */
export type PreparedTemplateUse = TemplateUse;
export type PreparedViewNode = PreparedMaterialNode | PreparedScopeNode | PreparedTemplateUse;
/** 共享模板只交付一份，内部响应式表达式依赖可以引用已声明参数。 */
export interface PreparedViewTemplate extends Omit<ViewTemplate, 'node'> {
  node: PreparedViewNode;
}
