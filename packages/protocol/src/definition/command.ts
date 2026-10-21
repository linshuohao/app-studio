import type { ArrayIndexPosition } from '../common.js';
import type { ValueSpec } from './expression.js';
import type { DataReference, ScopeHandleReference } from './reference.js';
/** 作者侧数字目的位置，复用与 Prepared 完全相同的下标语义和生成约束。 */
export type IndexPosition = ArrayIndexPosition;
/** 插入 / 移动到仍属于目标数组的指定稳定成员之前。 */
export interface BeforePosition {
  kind: 'before';
  item: ScopeHandleReference;
}
/** 插入 / 移动到仍属于目标数组的指定稳定成员之后。 */
export interface AfterPosition {
  kind: 'after';
  item: ScopeHandleReference;
}
/** 执行时解析目的位置；锚点失效、越界或非整数须失败，不静默修正。 */
export type ArrayPosition = IndexPosition | BeforePosition | AfterPosition;
/** 替换目标位置的值；写入结构可执行即可，业务 Schema 不作为写入门禁。 */
export interface SetCommand {
  op: 'set';
  /** 可写 Data 位置，不能是 Context / Event / 组件 Props。 */
  target: DataReference;
  /** 执行时按当前输入求值；不因值读取其他字段而自行建立订阅。 */
  value: ValueSpec;
}
/** 浅层更新对象字段，不递归深合并。 */
export interface PatchCommand {
  op: 'patch';
  target: DataReference;
  /** 待写字段字典，键为业务字段名，各值按 ValueSpec 求值。 */
  value: Record<string, ValueSpec>;
}
/** 删除目标属性，区别于把属性设置为 null；数组成员删除使用 array.remove。 */
export interface RemoveCommand {
  op: 'remove';
  target: DataReference;
}
/** 在指定数组位置插入一个求值后的成员；不以 maxItems 等业务约束阻止写入。 */
export interface ArrayInsertCommand {
  op: 'array.insert';
  /** 实际值必须能执行数组操作，否则报告结构失败。 */
  target: DataReference;
  position: ArrayPosition;
  value: ValueSpec;
}
/** 按稳定成员身份删除；数组重排后不能误删原下标的新成员。 */
export interface ArrayRemoveCommand {
  op: 'array.remove';
  target: DataReference;
  item: ScopeHandleReference;
}
/** 移动后保留成员身份；校验目的位置失败不能留下已经移除的半完成状态。 */
export interface ArrayMoveCommand {
  op: 'array.move';
  target: DataReference;
  /** 被移动的成员；与 position 中的目的锚点分别解释。 */
  item: ScopeHandleReference;
  position: ArrayPosition;
}
/** 顺序执行且默认非原子；后续失败不回滚先前成功修改，不是通用工作流。 */
export interface BatchCommand {
  op: 'batch';
  /** 保留命令顺序与次数，不能仅因相同目标合并两次 insert 等显式行为。 */
  commands: Command[];
}
/** 作者侧七类受控数据修改语言。网络 / 提交 / UI 动画由 Host 或物料负责。 */
export type Command =
  | SetCommand
  | PatchCommand
  | RemoveCommand
  | ArrayInsertCommand
  | ArrayRemoveCommand
  | ArrayMoveCommand
  | BatchCommand;
