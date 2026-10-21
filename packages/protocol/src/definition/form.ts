import type { JsonSchema, JsonValue } from '../common.js';
import type { Command } from './command.js';
import type { Expression } from './expression.js';
import type { DataReference, ScopeDeclaration } from './reference.js';
import type { Constraint, SchemaMessageOverride } from './validation.js';
import type { ViewNode, ViewTemplate } from './view.js';
/** 数据变化驱动的同步联动声明；实例随 Runtime / Scope 激活，不随 View 显隐注销。 */
export interface Reaction {
  /** 定义内规则身份，区别于每个 Scope 的实际运行实例身份。 */
  id: string;
  /** 规则使用的局部词法上下文；省略时不建立额外 Binder。 */
  scope?: ScopeDeclaration;
  /** 显式触发来源；when 和 Command 值的读取不会被静默加入。 */
  watch: DataReference[];
  /** 被触发后才检查的适用条件；省略时无额外条件。 */
  when?: Expression;
  /** 按序执行的受控命令；当前数据可立即读取，默认不整体回滚。 */
  then: Command[];
  /** 默认 false；只在新规则实例首次建立时应用，不因 View 重挂或业务 Reset 再次激活。 */
  runOnActivate?: boolean;
}
/** 作者维护和交换的 Canonical 定义。它是 Compiler 输入，不是 Runtime 的执行入口。 */
export interface FormDefinition {
  /** L1 语法 / 语义格式身份，独立于包版本和 Prepared 格式版本。 */
  protocolVersion: string;
  /** 业务表单身份，不是某次运行实例 ID。 */
  id: string;
  /** 该业务定义的修订身份；不用于推断引擎或能力兼容性。 */
  version: string;
  /** 完整业务数据模型；当前 Working Data 不保存在 Definition 中。 */
  data: { schema: JsonSchema };
  /** 按名称复用的纯表达式；不隐式捕获调用方局部 Scope。 */
  expressions?: Record<string, Expression>;
  /** 当前表单全部业务约束；缺省表示未额外声明 Constraint。 */
  constraints?: Constraint[];
  reactions?: Reaction[];
  /** Profile 名到入口节点，如 desktop / mobile；它们共用同一业务数据模型。 */
  views: Record<string, ViewNode>;
  /** 静态视图模板；编译后展开，不产生独立子表单或共享 UI 实例。 */
  viewTemplates?: Record<string, ViewTemplate>;
  /** 按业务 Schema 声明位置和关键字覆盖文案，不新增校验规则。 */
  validationMessages?: SchemaMessageOverride[];
  /** 非执行性元数据，允许任意业务 JSON 键，不在其中识别表达式。 */
  metadata?: Record<string, JsonValue>;
}
