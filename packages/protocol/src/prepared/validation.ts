import type {
  ConstraintPrerequisite,
  ExternalConstraint,
  FieldPrerequisite,
  InternalConstraint,
} from '../definition/validation.js';
import type { DataWatch, PreparedScopeDeclaration } from './reference.js';

/** 已解析的同步规则前置；Runtime 结合当前 Scope 绑定唯一实例。 */
export type PreparedConstraintPrerequisite = ConstraintPrerequisite;
/** 字段同步资格仍依赖 Schema 和相关适用 Internal，不含 External。 */
export interface PreparedFieldPrerequisite extends FieldPrerequisite {
  /** 已分析出的相关 Internal 声明 ID；存在性、环和唯一实例绑定由 Compiler 检查。 */
  constraintIds: string[];
}
/** 仍用 requires 字段表达前置，不增加 preparation / prerequisites 包装。 */
export type PreparedPrerequisite = PreparedConstraintPrerequisite | PreparedFieldPrerequisite;

/** 保留 when / assert / issue / scope，补全规则级有效观察。 */
export interface PreparedInternalConstraint extends Omit<InternalConstraint, 'requires' | 'scope'> {
  scope?: PreparedScopeDeclaration;
  /** when + assert 的可能读取及必要前置传递依赖；不是 Issue target 的复制。 */
  watch: DataWatch[];
  /** 省略表示没有显式前置；执行使用本轮结论，不复用历史通过结果。 */
  requires?: PreparedPrerequisite[];
}
/** 保留 validator / target / when / scope；输出 watch 已是有效失效集合。 */
export interface PreparedExternalConstraint extends Omit<
  ExternalConstraint,
  'watch' | 'requires' | 'scope'
> {
  scope?: PreparedScopeDeclaration;
  /** 合并作者 watch、when 和前置依赖；失效不等于立即发起请求。 */
  watch: DataWatch[];
  requires?: PreparedPrerequisite[];
}
/** 仍按原 Constraint Union / 数组交付，不转换成 executor 或规则索引表。 */
export type PreparedConstraint = PreparedInternalConstraint | PreparedExternalConstraint;
