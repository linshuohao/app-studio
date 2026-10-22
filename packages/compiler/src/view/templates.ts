import type { TemplateUse, ViewNode, ViewTemplate } from '@form-engine/protocol/definition';
import type { PreparedViewNode, PreparedViewTemplate } from '@form-engine/protocol/prepared';
import { ExpressionAnalyzer } from '../analysis/expression/analyze.js';
import {
  rootEnvironment,
  type LexicalEnvironment,
  type ScopeBinding,
} from '../analysis/reference/environment.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';

/** 只准备所选视图的模板传递闭包；模板体只保留一份，实参仍在调用处绑定。 */
export class TemplateCompiler {
  private readonly prepared = new Map<string, PreparedViewTemplate>();
  private readonly active = new Set<string>();
  constructor(
    private readonly declarations: Record<string, ViewTemplate>,
    private readonly expressions: ExpressionAnalyzer,
    private readonly compileNode: (
      node: ViewNode,
      pointer: string,
      env: LexicalEnvironment,
    ) => PreparedViewNode | undefined,
  ) {}

  use(use: TemplateUse, env: LexicalEnvironment, pointer: string): TemplateUse | undefined {
    const { references, diagnostics, source, models } = this.expressions;
    if (!own(this.declarations, use.$use)) {
      diagnostics.error(
        'TEMPLATE_NOT_FOUND',
        source(at(pointer, '$use')),
        `Unknown template ${use.$use}.`,
      );
      return undefined;
    }
    const declaration = this.declarations[use.$use]!;
    const params = declaration.params ?? {};
    for (const [name, actual] of Object.entries(use.with ?? {})) {
      if (!own(params, name))
        diagnostics.error(
          'TEMPLATE_PARAMETER_UNKNOWN',
          source(at(at(pointer, 'with'), name)),
          `Unknown parameter ${name}.`,
        );
      references.resolve(actual, env, at(at(pointer, 'with'), name));
    }
    const scopes = new Map<string, ScopeBinding>();
    for (const [name, param] of Object.entries(params)) {
      const location = at(at(at('/viewTemplates', use.$use), 'params'), name);
      const expected = models.schemaReference(param.schemaRef, source(at(location, 'schemaRef')));
      if (expected) {
        models.scan(expected);
        scopes.set(name, {
          model: expected,
          identity: JSON.stringify(['template:' + use.$use, name]),
          member: false,
        });
      }
      if (!use.with || !own(use.with, name))
        diagnostics.error(
          'TEMPLATE_PARAMETER_MISSING',
          source(at(pointer, 'with')),
          `Missing parameter ${name}.`,
        );
      else {
        const node = references.resolve(use.with[name]!, env, at(at(pointer, 'with'), name));
        if (expected && node)
          this.expressions.expect(
            { node, reads: [] },
            expected,
            at(at(pointer, 'with'), name),
            'TEMPLATE_ARGUMENT',
          );
      }
    }
    if (this.active.has(use.$use)) {
      diagnostics.error(
        'TEMPLATE_CYCLE',
        source(at(pointer, '$use')),
        `Template cycle through ${use.$use}.`,
      );
      return undefined;
    }
    if (!this.prepared.has(use.$use)) {
      if (this.active.size >= 128) {
        diagnostics.error(
          'TEMPLATE_BUDGET_EXCEEDED',
          source(pointer),
          'Template chain exceeds the analysis depth budget.',
        );
        return undefined;
      }
      this.active.add(use.$use);
      const node = this.compileNode(declaration.node, at(at('/viewTemplates', use.$use), 'node'), {
        ...rootEnvironment(),
        scopes,
      });
      this.active.delete(use.$use);
      if (node)
        this.prepared.set(use.$use, {
          ...(declaration.params ? { params: declaration.params } : {}),
          node,
        });
    }
    return use;
  }
  result(): Record<string, PreparedViewTemplate> {
    return Object.fromEntries([...this.prepared].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  }
}
