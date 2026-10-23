import type {
  DataReference,
  Reference,
  ValidationWatch,
  ScopeBinder,
  ScopeHandleReference,
} from '../definition/reference.js';

/** 输出保留词法名称与 JSON Pointer；真实 Scope ID 仅在运行时绑定。 */
export type PreparedDataReference = DataReference;
/** 读取语法与 L1 相同；Context / Event 的可用位置及只读边界保持不变。 */
export type PreparedReference = Reference;
/** 成员句柄仍使用词法 $scope，不序列化真实成员身份或数组下标。 */
export type PreparedScopeHandle = ScopeHandleReference;

/** 保留 Binder 原结构，仅将缺省 one 显式化；没有静态编号或真实成员身份。 */
export interface PreparedScopeBinder extends ScopeBinder {
  mode: 'one' | 'each';
}
/** 单 Binder 或非空有序链，后项可引用前项的词法别名。 */
export type PreparedScopeDeclaration =
  PreparedScopeBinder | [PreparedScopeBinder, ...PreparedScopeBinder[]];

/**
 * 规则和完整呈现表达式共用的静态观察项；不是已激活订阅。
 * 省略 aspect 等同 value，structure 只表示同一 Data 的集合结构观察。
 * 仅 Data 消费者使用；校验状态由独立 ValidationWatch 描述，不能混入 Constraint 数据依赖。
 */
export interface DataWatch extends DataReference {
  aspect?: 'value' | 'structure';
}

/** Reaction 保留显式来源；不会把 when / then 读取自动加入触发集合。 */
export type PreparedReactionWatch = DataWatch | ValidationWatch;
