import type { JsonValue } from '@form-engine/protocol';
import type { ValueSpec, ViewNode } from '@form-engine/protocol/definition';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import type {
  LockedCapability,
  PreparedDefinition,
  PreparedMaterialNode,
  PreparedValueSpec,
  PreparedViewNode,
} from '@form-engine/protocol/prepared';
import packageInfo from '../package.json';
import { validateMaterialManifest } from './capability-validation.js';
import { at, Diagnostics, own } from './diagnostics.js';
import { normalize, receive } from './input.js';
import { contentDigest } from './json.js';
import { SchemaModel } from './schema-model.js';
import { structure, structuralErrors } from './structure.js';
import { PREPARED_FORMAT_VERSION } from './types.js';
import type { CompileInput, CompileResult } from './types.js';

export function compile(input: CompileInput): CompileResult {
  const diagnostics = new Diagnostics();
  const fail = (): CompileResult => ({ success: false, diagnostics: diagnostics.list() });
  const received = receive(input, diagnostics);
  if (!received) return fail();
  const { definition, source } = normalize(received.definition, diagnostics);
  const { target = {}, catalog } = received;
  const profiles = Object.keys(definition.views);
  const profile = target.profile ?? (profiles.length === 1 ? profiles[0] : undefined);
  if (profile === undefined)
    diagnostics.error(
      'PROFILE_AMBIGUOUS',
      '/views',
      'Select a profile when the definition does not have exactly one view.',
    );
  else if (!own(definition.views, profile))
    diagnostics.error('PROFILE_NOT_FOUND', '/views', `Unknown view profile ${profile}.`);
  if (
    target.preparedFormatVersion !== undefined &&
    target.preparedFormatVersion !== PREPARED_FORMAT_VERSION
  )
    diagnostics.error(
      'PREPARED_FORMAT_UNSUPPORTED',
      '',
      `Only ${PREPARED_FORMAT_VERSION} is supported.`,
    );
  if (diagnostics.failed || profile === undefined) return fail();
  const unsupported = (pointer: string, description: string) =>
    diagnostics.error(
      'FEATURE_NOT_IMPLEMENTED',
      source(pointer),
      `${description} is not implemented in the current compiler slice.`,
    );
  for (const key of ['expressions', 'constraints', 'reactions', 'validationMessages'] as const)
    if (definition[key] && Object.keys(definition[key]).length) unsupported(at('', key), key);

  const models = new SchemaModel(
    definition.data.schema,
    received.schemaResources ?? {},
    diagnostics,
  );
  const locked = new Map<string, LockedCapability>();
  const contracts = new Map<string, MaterialManifest | undefined>();
  function material(id: string, pointer: string): MaterialManifest | undefined {
    if (contracts.has(id)) return contracts.get(id);
    if (!own(catalog.materials, id)) {
      diagnostics.error(
        'MATERIAL_NOT_FOUND',
        source(at(pointer, 'material')),
        `No material contract for ${id}.`,
      );
      return undefined;
    }
    const entry = catalog.materials[id]!;
    const base = at(at('/materials', id), 'manifest');
    const related = (suffix: string) => [{ sourceId: catalog.id, pointer: base + suffix }];
    const contract = validateMaterialManifest(entry.manifest);
    for (const error of contract.diagnostics)
      diagnostics.error(
        error.code,
        source(at(pointer, 'material')),
        error.message,
        related(error.sourcePointer),
      );
    if (id !== entry.manifest.id)
      diagnostics.error(
        'CAPABILITY_ID_MISMATCH',
        source(at(pointer, 'material')),
        `Catalog key ${id} differs from manifest id ${entry.manifest.id}.`,
        related('/id'),
      );
    if (target.platform !== undefined && target.platform !== entry.artifact.platform)
      diagnostics.error(
        'CAPABILITY_PLATFORM_MISMATCH',
        source(at(pointer, 'material')),
        `Material artifact ${entry.artifact.platform} does not match ${target.platform}.`,
        [{ sourceId: catalog.id, pointer: at(at('/materials', id), 'artifact') }],
      );
    if (
      !contract.valid ||
      id !== entry.manifest.id ||
      (target.platform !== undefined && target.platform !== entry.artifact.platform)
    ) {
      contracts.set(id, undefined);
      return undefined;
    }
    contracts.set(id, entry.manifest);
    locked.set(id, {
      id,
      version: entry.manifest.version,
      manifestDigest: contentDigest(entry.manifest as unknown as JsonValue),
      artifact: entry.artifact,
    });
    return entry.manifest;
  }
  function staticValue(
    value: ValueSpec,
    pointer: string,
  ): { supported: boolean; value: JsonValue } {
    if (value === null || typeof value !== 'object') return { supported: true, value };
    if (Array.isArray(value)) {
      const items = value.map((item, index) => staticValue(item, at(pointer, index)));
      return {
        supported: items.every((item) => item.supported),
        value: items.map((item) => item.value),
      };
    }
    if ('$literal' in value) return { supported: true, value: value.$literal! };
    if (own(value, '$expr')) {
      unsupported(pointer, 'Reactive expressions');
      return { supported: false, value: null };
    }
    const entries = Object.entries(value).map(
      ([key, item]) => [key, staticValue(item!, at(pointer, key))] as const,
    );
    return {
      supported: entries.every(([, item]) => item.supported),
      value: Object.fromEntries(entries.map(([key, item]) => [key, item.value])),
    };
  }
  function view(node: ViewNode, pointer: string): PreparedViewNode | undefined {
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
      id: `node:${definition.id}:${source(pointer)}`,
      ...(node.bindings ? { bindings: node.bindings } : {}),
      ...(node.on ? { on: node.on } : {}),
    };
    const props = staticValue(node.props ?? {}, at(pointer, 'props'));
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
                sourceId: catalog.id,
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
            view(child, at(at(at(pointer, 'slots'), slot), index)),
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
  const root = view(definition.views[profile]!, at('/views', profile));
  if (diagnostics.failed || !root) return fail();
  // Nonempty rules/expressions were rejected above. Shared unused templates are intentionally omitted.
  const shared = { ...definition };
  delete shared.viewTemplates;
  const prepared = {
    preparedFormatVersion: PREPARED_FORMAT_VERSION,
    build: {
      compilerVersion: packageInfo.version,
      catalogSnapshotId: catalog.id,
      profile,
      ...(target.platform !== undefined ? { platform: target.platform } : {}),
    },
    definition: { ...shared, views: Object.fromEntries([[profile, root]]) } as PreparedDefinition,
    resources: { schemas: models.resources(), requestSchemas: {} },
    capabilityLock: {
      materials: Object.fromEntries([...locked].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
      pureFunctions: {},
    },
    hostRequirements: { validators: [], events: [], requests: [] },
  };
  for (const error of structuralErrors(structure.prepared, prepared))
    diagnostics.error(
      'COMPILER_OUTPUT_INVALID',
      '',
      `Internal Prepared structure error at ${error.instancePath}: ${error.message}`,
    );
  return diagnostics.failed ? fail() : { success: true, prepared, diagnostics: diagnostics.list() };
}
