import type { ArtifactIdentity, JsonValue, JsonSchema } from '@form-engine/protocol';
import type { PureFunctionManifest } from '@form-engine/protocol/capability';

/** 一个纯函数的静态契约、制品身份和同步实现；Compiler 与 Runtime 使用同一份身份。 */
export interface FunctionBinding {
  /** 参数 / 返回值签名，供 Compiler 检查及 Runtime 装载与调用门禁使用。 */
  readonly manifest: PureFunctionManifest;
  /** Host 提供的构建制品标识，必须匹配 Prepared 能力锁。 */
  readonly artifact: ArtifactIdentity;
  /** 普通函数的同步调用入口；惰性控制形式由表达式求值器单独解释。 */
  readonly invoke: (args: readonly JsonValue[]) => JsonValue;
}
/** 函数 ID → 实现绑定；装载后按 Prepared 所需项固定，不动态替换。 */
export type FunctionRegistry = Readonly<Record<string, FunctionBinding>>;
/** 标记本模块真实创建的 core 绑定，防止 Host 仅通过同名注册覆盖保留语义。 */
const coreBindings = new WeakSet<FunctionBinding>();
/** 以对象身份检查内置绑定，不依赖可伪造的 manifest.id 字符串。 */
export const isCoreBinding = (binding: FunctionBinding) => coreBindings.has(binding);
/** 冻结内部新建的函数契约树并跳过已冻结子树；不负责复制外部业务数据。 */
function immutable<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}

/** 按 Host 的制品身份创建只读核心函数注册表；该身份须与 Compiler Catalog 使用值一致。 */
export function createCoreFunctions(artifact: ArtifactIdentity): FunctionRegistry {
  const number: JsonSchema = { type: 'number' },
    boolean: JsonSchema = { type: 'boolean' };
  const primitive: JsonSchema = { type: ['string', 'number', 'boolean', 'null'] };
  const entries: Record<string, FunctionBinding> = {};
  // 统一生成签名、冻结绑定并登记 core 身份；rest 描述可变参数类型。
  const add = (
    name: string,
    schemas: JsonSchema[],
    returns: JsonSchema,
    invoke: FunctionBinding['invoke'],
    rest?: JsonSchema,
  ) => {
    const binding: FunctionBinding = Object.freeze({
      artifact: Object.freeze({ ...artifact }),
      manifest: immutable({
        id: `core.${name}`,
        version: '1',
        parameters: schemas.map((schema, i) => ({ name: `arg${i}`, schema })),
        ...(rest === undefined ? {} : { restParameter: { name: 'rest', schema: rest } }),
        returns,
      }),
      invoke,
    });
    coreBindings.add(binding);
    entries[binding.manifest.id] = binding;
  };
  // 包装二元数值实现，直接调用时也拒绝非法输入、除零产生的非有限结果等。
  const numeric =
    (fn: (a: number, b: number) => number | boolean) => (args: readonly JsonValue[]) => {
      if (args.length !== 2 || args.some((v) => typeof v !== 'number' || !Number.isFinite(v)))
        throw Error('function: finite numbers required');
      const result = fn(args[0] as number, args[1] as number);
      if (typeof result === 'number' && !Number.isFinite(result))
        throw Error('function: non-finite result');
      return result;
    };
  add('eq', [primitive, primitive], boolean, ([a, b]) => Object.is(a, b));
  add('ne', [primitive, primitive], boolean, ([a, b]) => !Object.is(a, b));
  for (const [id, fn] of Object.entries({
    gt: (a: number, b: number) => a > b,
    gte: (a: number, b: number) => a >= b,
    lt: (a: number, b: number) => a < b,
    lte: (a: number, b: number) => a <= b,
  }))
    add(id, [number, number], boolean, numeric(fn));
  for (const [id, fn] of Object.entries({
    add: (a: number, b: number) => a + b,
    sub: (a: number, b: number) => a - b,
    mul: (a: number, b: number) => a * b,
    div: (a: number, b: number) => {
      if (b === 0) throw Error('function: division by zero');
      return a / b;
    },
  }))
    add(id, [number, number], number, numeric(fn));
  add('not', [boolean], boolean, ([value]) => !value);
  // 惰性控制形式只由 Runtime 解释；Catalog 仍发布普通签名，直接 invoke 则报错。
  const lazy = () => {
    throw Error('function: control form requires the expression evaluator');
  };
  add('and', [boolean, boolean], boolean, lazy, boolean);
  add('or', [boolean, boolean], boolean, lazy, boolean);
  add('if', [boolean, true, true], true, lazy);
  add('exists', [true], boolean, lazy);
  add('length', [{ type: ['string', 'array'] }], { type: 'integer', minimum: 0 }, ([value]) => {
    if (typeof value === 'string') return Array.from(value).length;
    if (Array.isArray(value)) return value.length;
    throw Error('function: length requires a string or array');
  });
  return Object.freeze(entries);
}
