import type { ViewNode } from '@form-engine/protocol/definition';
import type {
  PreparedMaterialNode,
  PreparedValueSpec,
  PreparedViewNode,
} from '@form-engine/protocol/prepared';
import type { CapabilityCatalog } from '../capability/catalog.js';
import type { SchemaModel } from '../analysis/schema/model.js';
import type { LexicalEnvironment } from '../analysis/reference/environment.js';
import { ValueCompiler } from '../analysis/value/compile.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';
import type { TemplateCompiler } from './templates.js';
import type { InteractionCompiler } from './interactions.js';

interface ViewCompileContext {
  definitionId: string;
  catalogSnapshotId: string;
  models: SchemaModel;
  diagnostics: Diagnostics;
  material: CapabilityCatalog['material'];
  values: ValueCompiler;
  env: LexicalEnvironment;
  templates: TemplateCompiler;
  interactions: InteractionCompiler;
  source: (pointer: string) => string;
}

/**
 * 保留物料 / Scope 原结构；每个完整 Props 表达式独立附加 watch，内部运算节点不订阅。
 * 表达式、Binding 与规则共用词法引用分析；模板 / 事件 / 请求映射仍单独处理。
 */
export function compileView(
  node: ViewNode,
  pointer: string,
  context: ViewCompileContext,
): PreparedViewNode | undefined {
  const {
    definitionId,
    catalogSnapshotId,
    models,
    diagnostics,
    material,
    source,
    values,
    env,
    templates,
    interactions,
  } = context;
  if ('scope' in node) {
    const bound = values.expressions.references.bind(node.scope, env, at(pointer, 'scope'));
    const child = compileView(node.node, at(pointer, 'node'), { ...context, env: bound.env });
    return child && { scope: { ...node.scope, mode: node.scope.mode ?? 'one' }, node: child };
  }
  if ('$use' in node) return templates.use(node, env, pointer);
  const manifest = material(node.material, pointer);
  if (!manifest) return undefined;
  const result: PreparedMaterialNode = {
    material: node.material,
    id: `node:${definitionId}:${source(pointer)}`,
    ...(node.bindings ? { bindings: node.bindings } : {}),
    ...(node.on ? { on: node.on } : {}),
  };
  const props = values.compile(node.props ?? {}, env, at(pointer, 'props'), true);
  if (props.node) {
    if (node.props !== undefined)
      result.props = props.prepared as Record<string, PreparedValueSpec>;
    const schema = models.addRoot(
      manifest.propsSchema ?? true,
      `https://form-engine.invalid/material/${encodeURIComponent(node.material)}/props`,
      source(at(pointer, 'props')),
    );
    models.scan(schema);
    values.expect(props, schema, at(pointer, 'props'), 'PROPS');
  }
  for (const [port, reference] of Object.entries(node.bindings ?? {})) {
    const location = source(at(at(pointer, 'bindings'), port));
    if (!manifest.bindings || !own(manifest.bindings, port)) {
      diagnostics.error(
        'BINDING_NOT_DECLARED',
        location,
        `Material ${node.material} has no binding ${port}.`,
      );
      continue;
    }
    // 例如 /name:string → 物料 value:string：检查结构连接，不读取真实字段值。
    const from = values.expressions.references.resolve(
      reference,
      env,
      at(at(pointer, 'bindings'), port),
    );
    const to = models.addRoot(
      manifest.bindings[port]!.schema,
      `https://form-engine.invalid/material/${encodeURIComponent(node.material)}/binding/${encodeURIComponent(port)}`,
      location,
    );
    models.scan(to);
    if (from) {
      const proof = models.connection(from, to);
      if (proof.kind !== 'compatible')
        diagnostics.error(
          proof.kind === 'incompatible' ? 'BINDING_INCOMPATIBLE' : 'BINDING_UNPROVEN',
          location,
          proof.reason,
          [
            {
              sourceId: catalogSnapshotId,
              pointer: at(at(at(at('/materials', node.material), 'manifest'), 'bindings'), port),
            },
          ],
        );
    }
  }
  if (node.slots)
    result.slots = Object.fromEntries(
      Object.entries(node.slots).map(([slot, children]) => {
        if (!manifest.slots?.includes(slot))
          diagnostics.error(
            'SLOT_NOT_DECLARED',
            source(at(at(pointer, 'slots'), slot)),
            `Material ${node.material} has no slot ${slot}.`,
          );
        const compiled = children.map((child, index) =>
          compileView(child, at(at(at(pointer, 'slots'), slot), index), context),
        );
        return [slot, compiled.filter((child): child is PreparedViewNode => child !== undefined)];
      }),
    );
  return { ...result, ...interactions.compile(node, manifest, env, pointer, result.id) };
}
