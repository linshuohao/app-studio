import type { JsonSchema } from '../common.js';

/** 纯函数的单个值参数。签名是数据契约，不允许注册函数接收 AST / 求值器。 */
export interface FunctionParameter {
  /** 说明用参数名；调用仍采用有序 args，不引入命名实参语法。 */
  name: string;
  schema: JsonSchema;
  /** 固定参数的可选项只能位于尾部，顺序合法性由 Compiler 检查。 */
  optional?: boolean;
}
/** 同步、确定性且无 I/O / 写 Data 副作用的计算契约；实际纯净性仍须实现审查和行为测试。 */
export interface PureFunctionManifest {
  /** Canonical 能力名；core.* 保留给内置集合，禁止业务覆盖或静默查找回退。 */
  id: string;
  version: string;
  /** 固定位置参数，按声明顺序匹配 args。 */
  parameters: FunctionParameter[];
  /** 可选的变长尾参数；省略表示不接受超出固定签名的额外实参。 */
  restParameter?: FunctionParameter;
  /** 结果的值类型；不把求值异常或 Missing 当成一个合法返回值。 */
  returns: JsonSchema;
}
