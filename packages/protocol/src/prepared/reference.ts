/** 编译期 Scope 模式的 ID；同一模式可对应多个运行时成员，绝不能当作 Runtime Scope ID。 */
export type ScopePatternId = string;
/**
 * 已解析的数据位置。path 是已解码 Pointer 分段，例如 /a~1b 对应 ['a/b']，不再重新解释词法别名。
 * root 从业务数据根读取；scope 由 Runtime 把静态模式绑定到当前具体成员，再按相对分段读取。
 */
export type PreparedDataReference =
  | { source: 'data'; base: 'root'; path: string[] }
  | { source: 'data'; base: 'scope'; scopePatternId: ScopePatternId; path: string[] };
/** 准备后的读取位置；Context / Event 仍只读，Event 仅在对应事件执行上下文有效。 */
export type PreparedReference =
  | PreparedDataReference
  | { source: 'context'; path: string[] }
  | { source: 'event'; path: string[] };
/** 已解析成员身份引用；执行时沿当前上下文绑定具体 Scope 身份，而非序列化某个当前成员。 */
export interface PreparedScopeHandle {
  scopePatternId: ScopePatternId;
}
/** 可由多个实例复用的 Scope 建立模式，不含真实成员数量、数据或活跃订阅。 */
export interface PreparedScopePattern {
  id: ScopePatternId;
  /** 静态父模式引用；省略表示没有额外的父 Scope Pattern。 */
  parentId?: ScopePatternId;
  /** 已解析的绑定来源；模式依赖及引用合法性须在编译期检查。 */
  from: PreparedDataReference;
  /** 规范化后的显式绑定模式；each 的实际成员在运行时展开。 */
  mode: 'one' | 'each';
}
/**
 * 准备后的可观察依赖，不扩展 L1 Reference.source。
 * Data 的结构观察仍属于同一数据源；校验 / 字段元状态由 Runtime 接口消费，不写回业务 Data。
 */
export type PreparedDependency =
  | { source: 'data'; reference: PreparedDataReference; aspect: 'value' | 'structure' }
  | { source: 'validation'; reference: PreparedDataReference }
  | { source: 'field-meta'; reference: PreparedDataReference };
/** 确定的静态观察条目；Runtime 只匹配实际变化，不据原始 AST 再补 watch。 */
export interface PreparedObservation {
  id: string;
  /** 指向已准备的规则或视图实体，用于激活、关联与诊断。 */
  owner: { kind: 'reaction' | 'constraint' | 'view'; id: string };
  /** 已按使用位置确定的依赖，不能把 when 的读取自动改成 Reaction 触发来源。 */
  dependencies: PreparedDependency[];
  /** 该观察绑定的静态上下文；具体活跃 Scope 在 Runtime 建立。 */
  scopePatternId?: ScopePatternId;
  /** 谁管理观察生命周期；它不是优先级，也不代表 runOnActivate 首次执行策略。 */
  activationOwner: 'runtime' | 'view-mounted';
}
/** 集中交付静态观察，由规则 / 视图引用条目 ID，不新增节点 / 属性更新分级。 */
export interface PreparedDependencyPlan {
  observations: Record<string, PreparedObservation>;
}
