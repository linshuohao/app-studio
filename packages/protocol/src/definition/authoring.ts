import type { FormDefinition } from './form.js';
import type { JsonPointer } from './reference.js';
import type { MaterialNode, ScopeNode, TemplateDataParam, TemplateUse } from './view.js';
/**
 * 允许书写简写的物料输入。供未来 Compiler 规范化使用，本包不实现转换算法。
 * Canonical MaterialNode 不接收 bind / children；简写冲突须报错，不能靠字段优先级静默覆盖。
 */
export interface AuthoringMaterialNode extends Omit<MaterialNode, 'slots'> {
  /** 根数据 Pointer 简写，例如 /name；规范化为 bindings.value，不随局部 Scope 改为相对路径。 */
  bind?: JsonPointer;
  /** slots.default 的书写简写，子节点也可继续使用 Authoring 语法。 */
  children?: AuthoringViewNode[];
  slots?: Record<string, AuthoringViewNode[]>;
}
/** 在 Scope 包装内递归接受 Authoring 子节点，绑定语义仍沿用 ScopeNode。 */
export interface AuthoringScopeNode extends Omit<ScopeNode, 'node'> {
  node: AuthoringViewNode;
}
/** Authoring 输入节点集合；规范化后只剩 Canonical ViewNode。 */
export type AuthoringViewNode = AuthoringMaterialNode | AuthoringScopeNode | TemplateUse;
/** 允许模板体使用简写；参数仍只支持 Typed Data Reference。 */
export interface AuthoringViewTemplate {
  params?: Record<string, TemplateDataParam>;
  node: AuthoringViewNode;
}
/** 带书写简写的输入表示，不是第三套业务协议，不能直接交给 Runtime 执行。 */
export interface AuthoringFormDefinition extends Omit<FormDefinition, 'views' | 'viewTemplates'> {
  views: Record<string, AuthoringViewNode>;
  viewTemplates?: Record<string, AuthoringViewTemplate>;
}
