import type { ArrayPosition, Command, IndexPosition } from '../definition/command.js';

/** 位置语法和执行边界与输入相同，不预先绑定真实成员或当前数组长度。 */
export type PreparedIndexPosition = IndexPosition;
export type PreparedArrayPosition = ArrayPosition;
/**
 * 七类命令保留原结构、词法引用和调用时 ValueSpec，不生成另一套指令树。
 * 数据写入仍由 Runtime 保护，不以业务 Schema 拦截合法结构的非法工作值。
 */
export type PreparedCommand = Command;
