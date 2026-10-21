/**
 * 作者侧 JSON Pointer。空串引用根值，'/' 引用空字符串属性；~0 / ~1 分别转义 ~ / /。
 * 不使用 './age' 等额外语法；路径能否在相应数据模型上成立由 Compiler 检查。
 * @pattern ^(?:/(?:[^~/]|~[01])*)*$
 */
export type JsonPointer = string;
/** 数据位置的声明；它不是读取结果，也不是数组成员的运行时身份。 */
export interface DataReference {
  source: 'data';
  /** 无 scope 时相对表单数据根；有 scope 时相对该词法绑定的数据位置。 */
  path: JsonPointer;
  /** 可见的词法名称，例如 insured。省略表示根数据，不隐式捕获当前数组项。 */
  scope?: string;
}
/** Host 提供的只读上下文引用，不是 Command 的可写目标，也不扩展 Data-only watch。 */
export interface ContextReference {
  source: 'context';
  /** 相对 Host Context 根的 JSON Pointer。 */
  path: JsonPointer;
}
/** 仅在处理相应物料事件或请求时有效；不能从全局表达式或普通 Reaction 隐式取得 Payload。 */
export interface EventReference {
  source: 'event';
  /** 相对本次 Payload 根；路径与值类型须能由对应 Event / Request 的 payloadSchema 证明。 */
  path: JsonPointer;
}
/** 读取来源的封闭集合。使用位置决定是否可读，写目标只接受 DataReference。 */
export type Reference = DataReference | ContextReference | EventReference;
/** 在规定的结构入口建立局部词法绑定；不创建第二份数据，也不是全局 Scope 注册项。 */
export interface ScopeBinder {
  /** 绑定的数据位置，只能为静态 Data Reference，不能用表达式动态拼接位置。 */
  from: DataReference;
  /** 后续词法上下文使用的名称；可见性及禁止遮蔽规则由 Compiler 检查。 */
  as: string;
  /** one 绑定单个位置，each 按数组成员建立上下文；Prepared 保存规范化后的显式模式。 */
  mode?: 'one' | 'each';
}
/** 规则可用一个 Binder 或非空有序链；后项可使用前项绑定，View 的 ScopeNode 只用一个 Binder。 */
export type ScopeDeclaration = ScopeBinder | [ScopeBinder, ...ScopeBinder[]];
/** 按词法名称取得当前成员的稳定身份，供删除 / 移动使用；不能当作普通业务值读取。 */
export interface ScopeHandleReference {
  /** 指向可见的成员上下文，不是固定数组下标，也不是可持久化的 Runtime Scope ID。 */
  $scope: string;
}
