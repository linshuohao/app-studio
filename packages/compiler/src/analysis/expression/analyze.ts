import type { JsonSchema, JsonValue } from '@form-engine/protocol';
import type { Expression } from '@form-engine/protocol/definition';
import type { DataWatch } from '@form-engine/protocol/prepared';
import type { CapabilityCatalog } from '../../capability/catalog.js';
import { Diagnostics } from '../../diagnostics/collector.js';
import { at } from '../../common/pointer.js';
import { own } from '../../common/object.js';
import {
  ReferenceAnalyzer,
  rootEnvironment,
  type LexicalEnvironment,
} from '../reference/environment.js';
import { mergeWatch } from '../reference/watch.js';
import type { SchemaNode } from '../schema/types.js';
import { literalSchema } from './literal.js';

export interface ExpressionAnalysis {
  node?: SchemaNode;
  reads: DataWatch[];
  known?: { value: JsonValue };
}

/** 一次递归同时取得返回模型和可能读取；所有消费者复用，不执行任何纯函数。 */
export class ExpressionAnalyzer {
  private readonly named = new Map<string, ExpressionAnalysis>();
  private readonly active = new Set<string>();
  private operations = 0;
  constructor(
    readonly references: ReferenceAnalyzer,
    private readonly declarations: Record<string, Expression>,
    private readonly catalog: CapabilityCatalog,
    readonly diagnostics: Diagnostics,
    readonly source: (pointer: string) => string,
  ) {}
  get models() {
    return this.references.models;
  }

  model(schema: JsonSchema, pointer: string): SchemaNode {
    return this.models.addRoot(
      schema,
      `https://form-engine.invalid/analysis/${encodeURIComponent(pointer)}`,
      this.source(pointer),
    );
  }
  literal(value: JsonValue, pointer: string): ExpressionAnalysis {
    return { node: this.model(literalSchema(value), pointer), reads: [], known: { value } };
  }
  namedExpression(name: string, pointer: string): ExpressionAnalysis {
    if (!own(this.declarations, name)) {
      this.diagnostics.error(
        'EXPRESSION_NOT_FOUND',
        this.source(pointer),
        `Unknown expression ${name}.`,
      );
      return { reads: [] };
    }
    if (this.active.has(name)) {
      this.diagnostics.error(
        'EXPRESSION_CYCLE',
        this.source(pointer),
        `Expression cycle through ${name}.`,
      );
      return { reads: [] };
    }
    const previous = this.named.get(name);
    if (previous) return previous;
    if (this.active.size >= 128) {
      this.diagnostics.error(
        'EXPRESSION_BUDGET_EXCEEDED',
        this.source(pointer),
        'Named expression chain exceeds the analysis depth budget.',
      );
      return { reads: [] };
    }
    this.active.add(name);
    // 全局命名表达式始终用根环境，不能捕获某次 Props / 规则调用方的局部别名或 Event。
    const result = this.analyze(
      this.declarations[name]!,
      rootEnvironment(),
      at('/expressions', name),
    );
    this.active.delete(name);
    this.named.set(name, result);
    return result;
  }
  checkDeclarations(): void {
    for (const name of Object.keys(this.declarations))
      this.namedExpression(name, at('/expressions', name));
  }
  analyze(expression: Expression, env: LexicalEnvironment, pointer: string): ExpressionAnalysis {
    if (++this.operations > 20_000) {
      this.diagnostics.error(
        'EXPRESSION_BUDGET_EXCEEDED',
        this.source(pointer),
        'Expression analysis budget exceeded.',
      );
      return { reads: [] };
    }
    if (expression === null || typeof expression !== 'object')
      return this.literal(expression, pointer);
    if ('literal' in expression) return this.literal(expression.literal, pointer);
    if ('use' in expression) return this.namedExpression(expression.use, at(pointer, 'use'));
    if ('ref' in expression) {
      const node = this.references.resolve(expression.ref, env, at(pointer, 'ref'));
      return {
        node,
        reads: node && expression.ref.source === 'data' ? [{ ...expression.ref }] : [],
      };
    }
    // 即使 core.if / and / or 在运行时短路，也要覆盖所有潜在参数读取。
    const args = expression.args.map((arg, index) =>
      this.analyze(arg, env, at(at(pointer, 'args'), index)),
    );
    const reads = mergeWatch(...args.map((arg) => arg.reads));
    const manifest = this.catalog.pureFunction(expression.op, at(pointer, 'op'));
    if (!manifest) return { reads };
    const required = manifest.parameters.filter((parameter) => !parameter.optional).length;
    if (
      args.length < required ||
      (!manifest.restParameter && args.length > manifest.parameters.length)
    )
      this.diagnostics.error(
        'FUNCTION_ARITY_INVALID',
        this.source(at(pointer, 'args')),
        `Invalid argument count for ${expression.op}.`,
      );
    args.forEach((arg, index) => {
      const parameter = manifest.parameters[index] ?? manifest.restParameter;
      if (!parameter) return;
      const schema = this.models.addRoot(
        parameter.schema,
        `https://form-engine.invalid/function/${encodeURIComponent(expression.op)}/parameter/${index < manifest.parameters.length ? index : 'rest'}`,
        this.source(at(at(pointer, 'args'), index)),
      );
      this.models.scan(schema);
      this.expect(arg, schema, at(at(pointer, 'args'), index), 'FUNCTION_ARGUMENT');
    });
    const node = this.models.addRoot(
      manifest.returns,
      `https://form-engine.invalid/function/${encodeURIComponent(expression.op)}/returns`,
      this.source(pointer),
    );
    this.models.scan(node);
    return { node, reads };
  }
  /** 静态常量检查实际值；动态结果用共用三态连接，失败分析不再制造类型级联错误。 */
  expect(analysis: ExpressionAnalysis, target: SchemaNode, pointer: string, code: string): void {
    if (!analysis.node) return;
    if (analysis.known) {
      this.models.validateValue(
        target,
        analysis.known.value,
        this.source(pointer),
        code + '_INCOMPATIBLE',
      );
      return;
    }
    const proof = this.models.connection(analysis.node, target);
    if (proof.kind !== 'compatible')
      this.diagnostics.error(
        code + (proof.kind === 'incompatible' ? '_INCOMPATIBLE' : '_UNPROVEN'),
        this.source(pointer),
        proof.reason,
      );
  }
  boolean(
    expression: Expression | undefined,
    env: LexicalEnvironment,
    pointer: string,
  ): DataWatch[] {
    if (expression === undefined) return [];
    const result = this.analyze(expression, env, pointer);
    this.expect(
      result,
      this.model({ type: 'boolean' }, '/expected/boolean'),
      pointer,
      'EXPRESSION_RESULT',
    );
    return result.reads;
  }
}
