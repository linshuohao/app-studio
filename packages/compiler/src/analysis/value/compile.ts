import type { JsonValue, JsonSchema } from '@form-engine/protocol';
import type { ValueSpec } from '@form-engine/protocol/definition';
import type { PreparedValueSpec } from '@form-engine/protocol/prepared';
import type { LexicalEnvironment } from '../reference/environment.js';
import { mergeWatch } from '../reference/watch.js';
import { ExpressionAnalyzer, type ExpressionAnalysis } from '../expression/analyze.js';
import { at } from '../../common/pointer.js';
import { own, record } from '../../common/object.js';
import type { SchemaNode } from '../schema/types.js';

export interface ValueAnalysis extends ExpressionAnalysis {
  prepared?: PreparedValueSpec;
  children?: ReadonlyArray<readonly [string, ValueAnalysis]>;
}

/** 对象 / 数组形状与表达式共用分析。reactive 仅决定包装是否带 watch，不决定读取解析。 */
export class ValueCompiler {
  constructor(readonly expressions: ExpressionAnalyzer) {}
  /** 动态整体证明结构；已知子值仍验证实际限制，不能因旁边有 $expr 就跳过 minLength 等规则。 */
  expect(result: ValueAnalysis, target: SchemaNode, pointer: string, code: string): void {
    const { models, source } = this.expressions;
    if (result.known) {
      models.validateValue(target, result.known.value, source(pointer), code + '_INVALID');
      return;
    }
    this.expressions.expect(result, target, pointer, code);
    const node = models.dereference(target);
    if (!node || !record(node.schema)) return;
    for (const [key, child] of result.children ?? []) {
      const properties = node.schema.properties;
      if (node.schema.type === 'object' && record(properties) && own(properties, key)) {
        const projected = models.project(
          node,
          '/' + key.replaceAll('~', '~0').replaceAll('/', '~1'),
          source(at(pointer, key)),
        );
        if (projected) this.checkKnown(child, projected, at(pointer, key), code);
      } else if (node.schema.type === 'array' && !node.schema.prefixItems) {
        const item = models.arrayItem(node, source(pointer));
        if (item) this.checkKnown(child, item, at(pointer, key), code);
      }
    }
  }
  private checkKnown(
    result: ValueAnalysis,
    target: SchemaNode,
    pointer: string,
    code: string,
  ): void {
    if (result.known || result.children) this.expect(result, target, pointer, code);
  }
  compile(
    value: ValueSpec,
    env: LexicalEnvironment,
    pointer: string,
    reactive: boolean,
  ): ValueAnalysis {
    if (value === null || typeof value !== 'object')
      return { ...this.expressions.literal(value, pointer), prepared: value };
    if (!Array.isArray(value) && '$literal' in value)
      return {
        ...this.expressions.literal(value.$literal!, pointer),
        prepared: value as { $literal: JsonValue },
      };
    if (!Array.isArray(value) && '$expr' in value) {
      const result = this.expressions.analyze(value.$expr!, env, at(pointer, '$expr'));
      // 按调用求值的位置只返回分析事实，输出继续使用原 ValueSpec，不生成持续观察包装。
      return {
        ...result,
        ...(reactive ? { prepared: { $expr: value.$expr!, watch: mergeWatch(result.reads) } } : {}),
      };
    }
    const entries = Object.entries(value).map(
      ([key, child]) => [key, this.compile(child, env, at(pointer, key), reactive)] as const,
    );
    const allKnown = entries.every(([, child]) => child.known);
    const known = allKnown
      ? {
          value: (Array.isArray(value)
            ? entries.map(([, child]) => child.known!.value)
            : Object.fromEntries(
                entries.map(([key, child]) => [key, child.known!.value]),
              )) as JsonValue,
        }
      : undefined;
    const valid = entries.every(([, child]) => child.node);
    const schema: JsonSchema = Array.isArray(value)
      ? {
          type: 'array',
          items: entries.length
            ? {
                anyOf: entries.map(([, child]) =>
                  child.node ? this.expressions.models.referenceSchema(child.node) : true,
                ),
              }
            : false,
        }
      : {
          type: 'object',
          properties: Object.fromEntries(
            entries.map(([key, child]) => [
              key,
              child.node ? this.expressions.models.referenceSchema(child.node) : true,
            ]),
          ),
          required: entries.map(([key]) => key),
          additionalProperties: false,
        };
    return {
      node: valid ? this.expressions.model(schema, pointer) : undefined,
      children: entries,
      reads: mergeWatch(...entries.map(([, child]) => child.reads)),
      ...(known ? { known } : {}),
      ...(reactive
        ? {
            prepared: Array.isArray(value)
              ? entries.map(([, child]) => child.prepared!)
              : Object.fromEntries(entries.map(([key, child]) => [key, child.prepared!])),
          }
        : {}),
    };
  }
}
