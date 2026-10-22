import type { JsonValue, JsonSchema } from '@form-engine/protocol';
import type { ValueSpec } from '@form-engine/protocol/definition';
import type { PreparedValueSpec } from '@form-engine/protocol/prepared';
import type { LexicalEnvironment } from '../reference/environment.js';
import { mergeWatch } from '../reference/watch.js';
import { ExpressionAnalyzer, type ExpressionAnalysis } from '../expression/analyze.js';
import { at } from '../../common/pointer.js';
import { own, record } from '../../common/object.js';
import type { SchemaNode } from '../schema/types.js';
import { schemaUnionBranches } from '../schema/connection.js';
import { Diagnostics } from '../../diagnostics/collector.js';

export interface ValueAnalysis extends ExpressionAnalysis {
  prepared?: PreparedValueSpec;
  children?: ReadonlyArray<readonly [string, ValueAnalysis]>;
}

/** 对象 / 数组形状与表达式共用分析。reactive 仅决定包装是否带 watch，不决定读取解析。 */
export class ValueCompiler {
  private checks = 0;
  constructor(readonly expressions: ExpressionAnalyzer) {}
  /** 动态整体证明结构；已知子值仍验证实际限制，不能因旁边有 $expr 就跳过 minLength 等规则。 */
  expect(
    result: ValueAnalysis,
    target: SchemaNode,
    pointer: string,
    code: string,
    diagnostics = this.expressions.diagnostics,
    visiting = new Set<string>(),
  ): void {
    const { models, source } = this.expressions;
    if (!result.node) return;
    if (++this.checks > 20_000) {
      diagnostics.error(
        code + '_UNPROVEN',
        source(pointer),
        'Partial value validation budget exceeded.',
      );
      return;
    }
    if (result.known) {
      models.validateValue(
        target,
        result.known.value,
        source(pointer),
        code + '_INVALID',
        diagnostics,
      );
      return;
    }
    const node = models.dereference(target);
    const branches = node && result.children ? schemaUnionBranches(node, 'anyOf') : undefined;
    if (branches) {
      const key = JSON.stringify([
        result.node.document.uri,
        result.node.pointer,
        node!.document.uri,
        node!.pointer,
      ]);
      if (visiting.has(key) || visiting.size >= 128) {
        diagnostics.error(
          code + '_UNPROVEN',
          source(pointer),
          'Recursive partial value relationship cannot be proven.',
        );
        return;
      }
      visiting.add(key);
      let compatible = false,
        uncertain = false;
      try {
        for (const branch of branches) {
          if (models.connection(result.node, branch).kind !== 'compatible') continue;
          compatible = true;
          // 分支试检不能污染全局诊断：任一完整候选通过，即满足 anyOf。
          const trial = new Diagnostics();
          this.expect(result, branch, pointer, code, trial, visiting);
          if (!trial.failed) return;
          uncertain ||= trial.list().some((item) => item.code.endsWith('_UNPROVEN'));
        }
        if (compatible)
          diagnostics.error(
            code + (uncertain ? '_UNPROVEN' : '_INVALID'),
            source(pointer),
            'Known value fragments do not satisfy a proven schema alternative.',
          );
        else this.expressions.expect(result, target, pointer, code, diagnostics);
      } finally {
        visiting.delete(key);
      }
      return;
    }
    this.expressions.expect(result, target, pointer, code, diagnostics);
    if (!node || !record(node.schema)) return;
    const types = Array.isArray(node.schema.type) ? node.schema.type : [node.schema.type];
    const actual = models.dereference(result.node);
    const containerType = actual && record(actual.schema) ? actual.schema.type : undefined;
    for (const [key, child] of result.children ?? []) {
      const properties = node.schema.properties;
      if (
        containerType === 'object' &&
        types.includes('object') &&
        ((record(properties) && own(properties, key)) ||
          (!node.schema.patternProperties && record(node.schema.additionalProperties)))
      ) {
        const projected =
          record(properties) && own(properties, key)
            ? models.child(
                models.child(node, 'properties', properties),
                key,
                properties[key] as JsonSchema,
              )
            : models.child(
                node,
                'additionalProperties',
                node.schema.additionalProperties as JsonSchema,
              );
        this.checkKnown(child, projected, at(pointer, key), code, diagnostics, visiting);
      } else if (containerType === 'array' && types.includes('array') && !node.schema.prefixItems) {
        const item = models.child(node, 'items', (node.schema.items ?? true) as JsonSchema);
        this.checkKnown(child, item, at(pointer, key), code, diagnostics, visiting);
      }
    }
  }
  private checkKnown(
    result: ValueAnalysis,
    target: SchemaNode,
    pointer: string,
    code: string,
    diagnostics: Diagnostics,
    visiting: Set<string>,
  ): void {
    if (result.known || result.children)
      this.expect(result, target, pointer, code, diagnostics, visiting);
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
