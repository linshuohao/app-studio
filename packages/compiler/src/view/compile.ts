import type { ViewNode } from '@form-engine/protocol/definition';
import type {
  PreparedMaterialNode,
  PreparedValueSpec,
  PreparedViewNode,
} from '@form-engine/protocol/prepared';
import type { createMaterialCatalog } from '../capability/catalog.js';
import type { SchemaModel } from '../analysis/schema/model.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';
import { compileStaticValue } from './value.js';

interface ViewCompileContext {
  definitionId: string;
  catalogSnapshotId: string;
  models: SchemaModel;
  diagnostics: Diagnostics;
  material: ReturnType<typeof createMaterialCatalog>['material'];
  source: (pointer: string) => string;
  unsupported: (pointer: string, description: string) => void;
}

export function compileView(
  node: ViewNode,
  pointer: string,
  context: ViewCompileContext,
): PreparedViewNode | undefined {
  const { definitionId, catalogSnapshotId, models, diagnostics, material, source, unsupported } =
    context;
  if ('scope' in node) {
    unsupported(at(pointer, 'scope'), 'Scope views');
    return undefined;
  }
  if ('$use' in node) {
    unsupported(at(pointer, '$use'), 'Template use');
    return undefined;
  }
  const manifest = material(node.material, pointer);
  if (!manifest) return undefined;
  const result: PreparedMaterialNode = {
    material: node.material,
    id: `node:${definitionId}:${source(pointer)}`,
    ...(node.bindings ? { bindings: node.bindings } : {}),
    ...(node.on ? { on: node.on } : {}),
  };
  const props = compileStaticValue(node.props ?? {}, at(pointer, 'props'), unsupported);
  if (props.supported) {
    // Recursive inspection proved there are no reactive wrappers in this slice.
    if (node.props !== undefined) result.props = node.props as Record<string, PreparedValueSpec>;
    const schema = models.addRoot(
      manifest.propsSchema ?? true,
      `https://form-engine.invalid/material/${encodeURIComponent(node.material)}/props`,
      source(at(pointer, 'props')),
    );
    models.scan(schema);
    models.validateValue(schema, props.value, source(at(pointer, 'props')));
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
    if (reference.scope !== undefined) {
      diagnostics.error('SCOPE_NOT_VISIBLE', location, `No visible Scope ${reference.scope}.`);
      continue;
    }
    const from = models.dataReference(reference.path, location);
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
  for (const [event] of Object.entries(node.on ?? {})) {
    if (!manifest.events || !own(manifest.events, event))
      diagnostics.error(
        'EVENT_NOT_DECLARED',
        source(at(at(pointer, 'on'), event)),
        `Material ${node.material} has no event ${event}.`,
      );
    else unsupported(at(at(pointer, 'on'), event), 'Event mappings');
  }
  for (const name of Object.keys(manifest.requests ?? {}))
    if (!node.requests || !own(node.requests, name))
      diagnostics.error(
        'REQUEST_MAPPING_MISSING',
        source(at(pointer, 'requests')),
        `Material ${node.material} requires request mapping ${name}.`,
      );
  for (const name of Object.keys(node.requests ?? {})) {
    if (!manifest.requests || !own(manifest.requests, name))
      diagnostics.error(
        'REQUEST_NOT_DECLARED',
        source(at(at(pointer, 'requests'), name)),
        `Material ${node.material} has no request ${name}.`,
      );
    else unsupported(at(at(pointer, 'requests'), name), 'Request mappings');
  }
  // Request mappings require prepared contracts; never accidentally copy authoring mappings.
  delete result.requests;
  return result;
}
