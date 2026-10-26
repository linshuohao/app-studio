import type { ValidateFunction } from 'ajv';
import type { JsonValue, JsonSchema } from '@form-engine/protocol';
import type { Expression, Reference, ValueSpec } from '@form-engine/protocol/definition';
import type { PreparedValueSpec } from '@form-engine/protocol/prepared';
import { isCoreBinding, type FunctionRegistry } from '@form-engine/pure-functions';
import { ownJson, readAt } from '../data/json.js';
import { resolvePath, type ReadView, type ScopeBinding } from '../scope/registry.js';
import { createSchemaCompiler } from '../validation/schema.js';
import { observeRejection } from '../lifecycle/async.js';

/**
 * 一次求值的读取环境：固定 Data 视图、Context、词法 Scope 与可选 Event。
 * validation 回调读取当前校验投影；此对象不保存执行预算或诊断历史。
 */
export interface EvaluationFrame {
  /** 本次读取的数据根与成员索引版本。 */
  readonly view: ReadView;
  /** 当前词法别名绑定；具名全局表达式求值时清空。 */
  readonly scope: ScopeBinding;
  /** 本次捕获的只读 Host 环境输入，与 Data 分开。 */
  readonly context: JsonValue;
  /** 本次交互的 Payload；没有事件输入的场景不可读取 event 引用。 */
  readonly event?: JsonValue;
  /** 延迟读取当前字段校验投影，由 Runtime 注入，避免求值器拥有校验状态。 */
  readonly validation?: (
    reference: Extract<Reference, { source: 'validation' }>,
    scope: ScopeBinding,
  ) => JsonValue;
}
/** 缺失值信号：允许 exists 捕获缺失，同时保留其他求值错误。 */
export class MissingValue extends Error {
  /** 统一 Missing 错误身份，供 Runtime 转成 ReadResult.kind=missing。 */
  constructor() {
    super('expression: missing value');
  }
}
/** 只读表达式解释器；函数实现 / Schema 在装载时绑定，每次求值显式接收读取环境。 */
export class Evaluator {
  /** 纯函数的固定参数、可变参数及返回值校验器，实例内编译一次后复用。 */
  private readonly signatures = new Map<
    string,
    { args: ValidateFunction[]; rest?: ValidateFunction; result: ValidateFunction }
  >();
  /** 预编译函数签名；Schema 资源仅从 Prepared 提供的闭合资源表解析。 */
  constructor(
    /** 已编译的具名表达式表，只允许按自有名称引用。 */
    private readonly named: Readonly<Record<string, Expression>>,
    /** 已匹配能力锁的纯函数实现；只调用，不动态切换注册。 */
    private readonly functions: FunctionRegistry,
    resources: Readonly<Record<string, JsonSchema>> = {},
  ) {
    const compile = createSchemaCompiler(resources);
    for (const [id, { manifest }] of Object.entries(functions)) {
      const base = `https://form-engine.invalid/function/${encodeURIComponent(id)}`;
      this.signatures.set(id, {
        args: manifest.parameters.map((parameter, index) =>
          compile(parameter.schema, `${base}/parameter/${index}`),
        ),
        ...(manifest.restParameter
          ? { rest: compile(manifest.restParameter.schema, `${base}/parameter/rest`) }
          : {}),
        result: compile(manifest.returns, `${base}/returns`),
      });
    }
  }
  /** 分源读取 Data / Context / Event / Validation；缺失抛 MissingValue，非法绑定抛错。 */
  reference(reference: Reference, frame: EvaluationFrame): JsonValue {
    if (reference.source === 'validation') {
      if (!frame.validation) throw Error('expression: validation unavailable');
      return frame.validation(reference, frame.scope);
    }
    const result =
      reference.source === 'data'
        ? readAt(frame.view.root, resolvePath(frame.view, reference, frame.scope))
        : reference.source === 'context'
          ? readAt(frame.context, reference.path)
          : frame.event === undefined
            ? (() => {
                throw Error('expression: event unavailable');
              })()
            : readAt(frame.event, reference.path);
    if (result.kind === 'missing') throw new MissingValue();
    return result.value;
  }
  /**
   * 递归求值表达式，检查函数参数 / 返回值；stack 检测本次具名表达式引用环。
   * core.if / and / or / exists 在此实现惰性求值，未选分支不会调用函数或读取引用。
   */
  expression(expression: Expression, frame: EvaluationFrame, stack = new Set<string>()): JsonValue {
    if (expression === null || typeof expression !== 'object') return ownJson(expression);
    if ('literal' in expression) return ownJson(expression.literal);
    if ('ref' in expression) return this.reference(expression.ref, frame);
    if ('use' in expression) {
      const target = Object.hasOwn(this.named, expression.use)
        ? this.named[expression.use]
        : undefined;
      if (target === undefined || stack.has(expression.use))
        throw Error('expression: unknown or cyclic named expression');
      const next = new Set(stack);
      next.add(expression.use);
      return this.expression(target, { ...frame, scope: {}, event: undefined }, next);
    }
    const binding = this.functions[expression.op],
      signature = this.signatures.get(expression.op);
    if (!binding || !signature) throw Error('expression: unbound function');
    const { manifest } = binding,
      args = expression.args;
    const minimum = manifest.parameters.filter((p) => !p.optional).length;
    if (
      args.length < minimum ||
      (!manifest.restParameter && args.length > manifest.parameters.length)
    )
      throw Error('expression: argument count');
    const evaluate = (index: number) => {
      const value = this.expression(args[index]!, frame, stack);
      const validator = signature.args[index] ?? signature.rest;
      if (!validator?.(value)) throw Error('expression: argument type');
      return value;
    };
    if (expression.op.startsWith('core.') && !isCoreBinding(binding))
      throw Error('expression: reserved core implementation');
    if (expression.op === 'core.if') return evaluate(0) ? evaluate(1) : evaluate(2);
    if (expression.op === 'core.and' || expression.op === 'core.or') {
      const and = expression.op === 'core.and';
      for (let i = 0; i < args.length; i++) if (evaluate(i) === !and) return !and;
      return and;
    }
    if (expression.op === 'core.exists') {
      try {
        evaluate(0);
        return true;
      } catch (error) {
        if (error instanceof MissingValue) return false;
        throw error;
      }
    }
    const values = args.map((_, i) => evaluate(i));
    const returned: unknown = binding.invoke(values);
    // 纯函数仍同步报错；后续拒绝只消费，不重复报告非法异步返回。
    if (observeRejection(returned)) {
      throw Error('expression: pure function must return JSON synchronously');
    }
    const result = ownJson(returned);
    if (!signature.result(result)) throw Error('expression: return type');
    return result;
  }
  /** 按 ValueSpec 递归解析 $expr / $literal，普通对象与数组重建为引擎拥有的 JSON。 */
  value(specification: ValueSpec | PreparedValueSpec, frame: EvaluationFrame): JsonValue {
    if (specification === null || typeof specification !== 'object') return ownJson(specification);
    if (Array.isArray(specification))
      return ownJson(specification.map((entry) => this.value(entry, frame)));
    if ('$literal' in specification && specification.$literal !== undefined)
      return ownJson(specification.$literal);
    if ('$expr' in specification && specification.$expr !== undefined)
      return this.expression(specification.$expr, frame);
    return ownJson(
      Object.fromEntries(
        Object.entries(specification).map(([key, entry]) => [key, this.value(entry!, frame)]),
      ),
    );
  }
  /** when / assert 的严格布尔入口，拒绝用字符串或数值的 truthy / falsy 替代布尔值。 */
  boolean(expression: Expression, frame: EvaluationFrame): boolean {
    const result = this.expression(expression, frame);
    if (typeof result !== 'boolean') throw Error('expression: boolean required');
    return result;
  }
}
