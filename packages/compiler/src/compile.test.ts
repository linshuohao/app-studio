import { describe, expect, it } from 'vitest';
import type { CompilerInputDefinition } from '@form-engine/protocol/definition';
import type { CapabilityCatalogSnapshot } from '@form-engine/protocol/capability';
import * as compiler from './index.js';

const digest = `sha256:${'1'.repeat(64)}` as const;
function input() {
  const definition: CompilerInputDefinition = {
    protocolVersion: 'test-protocol',
    id: 'enrollment',
    version: 'draft',
    data: {
      schema: {
        type: 'object',
        properties: { name: { type: 'string' }, age: { type: 'integer' } },
        additionalProperties: false,
      },
    },
    views: { only: { material: 'input', bind: '/name', props: { label: '姓名' } } },
    metadata: { watch: { $expr: 'business-data' } },
  };
  const catalog: CapabilityCatalogSnapshot = {
    id: 'catalog-fixed',
    materials: {
      input: {
        manifest: {
          id: 'input',
          version: 'v1',
          propsSchema: {
            type: 'object',
            properties: { label: { type: 'string' } },
            additionalProperties: false,
          },
          bindings: { value: { schema: { type: 'string' } } },
          slots: ['default'],
        },
        artifact: { id: 'app-build', platform: 'web', digest },
      },
    },
    pureFunctions: {},
  };
  return { definition, catalog };
}
function errors(result: ReturnType<typeof compiler.compile>) {
  expect(result.success).toBe(false);
  expect(result).not.toHaveProperty('prepared');
  return result.diagnostics;
}

describe('compile: first executable slice', () => {
  it('normalizes authoring input and produces a reusable, locked, single-view Prepared', () => {
    const source = input();
    const before = structuredClone(source);
    const result = compiler.compile(source);
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(result.prepared.definition.views).toEqual({
      only: {
        id: 'node:enrollment:/views/only',
        material: 'input',
        props: { label: '姓名' },
        bindings: { value: { source: 'data', path: '/name' } },
      },
    });
    expect(result.prepared.definition.metadata).toEqual(before.definition.metadata);
    expect(result.prepared.build).toMatchObject({
      catalogSnapshotId: 'catalog-fixed',
      profile: 'only',
    });
    expect(result.prepared.build).not.toHaveProperty('platform');
    expect(result.prepared.capabilityLock.materials.input).toMatchObject({
      id: 'input',
      version: 'v1',
      artifact: { digest },
    });
    expect(result.prepared.resources).toEqual({ schemas: {}, requestSchemas: {} });
    expect(result.prepared.hostRequirements).toEqual({ validators: [], events: [], requests: [] });
    expect(source).toEqual(before);
    result.prepared.definition.data.schema = false;
    expect(source).toEqual(before);
  });

  it('selects an explicit profile, ignores other-platform semantics, and only locks used materials', () => {
    const source = input();
    source.definition.views.mobile = { material: 'not-in-web' };
    source.catalog.materials.unused = {
      ...source.catalog.materials.input!,
      manifest: { id: 'unused', version: 'v1' },
    };
    const result = compiler.compile({ ...source, target: { profile: 'only' } });
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(Object.keys(result.prepared.definition.views)).toEqual(['only']);
    expect(Object.keys(result.prepared.capabilityLock.materials)).toEqual(['input']);
    expect(source.definition.views).toHaveProperty('mobile');
  });

  it('requires a profile when there are multiple views', () => {
    const source = input();
    source.definition.views.other = { material: 'input' };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'PROFILE_AMBIGUOUS' }),
    );
    expect(errors(compiler.compile({ ...source, target: { profile: 'absent' } }))).toContainEqual(
      expect.objectContaining({ code: 'PROFILE_NOT_FOUND' }),
    );
  });

  it('rejects conflicting shorthands and points to the original authoring property', () => {
    const source = input();
    source.definition.views.only = {
      material: 'input',
      bind: '/name',
      bindings: { value: { source: 'data', path: '/name' } },
    };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'AUTHORING_CONFLICT', sourcePointer: '/views/only/bind' }),
    );
    source.definition.views.only = { material: 'input', children: [], slots: { default: [] } };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({
        code: 'AUTHORING_CONFLICT',
        sourcePointer: '/views/only/children',
      }),
    );
  });

  it('normalizes child slots recursively without confusing literal protocol-shaped business values', () => {
    const source = input();
    source.catalog.materials.input!.manifest.propsSchema = true;
    source.definition.views.only = {
      material: 'input',
      props: { watch: 'own-property', raw: { $literal: { $expr: 'raw', watch: ['data'] } } },
      children: [{ material: 'input', bind: '/name' }],
    };
    const result = compiler.compile(source);
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(result.prepared.definition.views.only).toMatchObject({
      props: { watch: 'own-property', raw: { $literal: { $expr: 'raw', watch: ['data'] } } },
      slots: {
        default: [
          {
            id: 'node:enrollment:/views/only/children/0',
            bindings: { value: { source: 'data', path: '/name' } },
          },
        ],
      },
    });
  });

  it('accumulates independent contract errors and suppresses consequences of missing material contracts', () => {
    const source = input();
    source.definition.views.only = {
      material: 'input',
      props: { label: 12 },
      bindings: { value: { source: 'data', path: '/ghost' } },
      slots: { unknown: [{ material: 'missing', props: { anything: false } }] },
    };
    const diagnostics = errors(compiler.compile(source));
    expect(diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        'PROPS_INVALID',
        'REFERENCE_NOT_FOUND',
        'SLOT_NOT_DECLARED',
        'MATERIAL_NOT_FOUND',
      ]),
    );
    expect(diagnostics.filter((d) => d.sourcePointer.includes('/slots/unknown/0'))).toHaveLength(1);
  });

  it('checks Binding model compatibility without validating current working data', () => {
    const source = input();
    source.definition.views.only = { material: 'input', bind: '/age' };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'BINDING_INCOMPATIBLE', sourcePointer: '/views/only/bind' }),
    );
    source.catalog.materials.input!.manifest.bindings!.value!.schema = {
      type: 'number',
      minimum: 18,
    };
    expect(compiler.compile(source).success).toBe(true);
  });

  it('rejects unprovable connections instead of pretending they are compatible', () => {
    const source = input();
    source.definition.data.schema = {
      type: 'object',
      properties: { name: { not: { type: 'integer' } } },
    };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'BINDING_UNPROVEN' }),
    );
  });

  it('resolves escaped root-data properties and local schema refs', () => {
    const source = input();
    source.definition.data.schema = {
      type: 'object',
      properties: { 'a/b': { $ref: '#/$defs/Name' } },
      $defs: { Name: { type: 'string' } },
    };
    source.definition.views.only = { material: 'input', bind: '/a~1b' };
    expect(compiler.compile(source).success).toBe(true);
  });

  it('does not prove object compatibility when open source properties can violate target properties', () => {
    const source = input();
    source.definition.data.schema = { type: 'object', properties: { name: { type: 'object' } } };
    source.catalog.materials.input!.manifest.bindings!.value!.schema = {
      type: 'object',
      properties: { label: { type: 'string' } },
    };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'BINDING_UNPROVEN' }),
    );
  });

  it('does not silently ignore conditional required-property constraints during structural proof', () => {
    const source = input();
    source.definition.data.schema = {
      type: 'object',
      properties: {
        name: {
          type: 'object',
          properties: { a: { type: 'string' } },
          additionalProperties: false,
        },
      },
    };
    source.catalog.materials.input!.manifest.bindings!.value!.schema = {
      type: 'object',
      dependentRequired: { a: ['b'] },
    };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'BINDING_UNPROVEN' }),
    );
  });

  it('indexes nested schema IDs before resolving references and does not register them twice in Ajv', () => {
    const source = input();
    source.definition.data.schema = {
      $id: 'https://example.invalid/root',
      type: 'object',
      properties: { name: { $ref: 'name' } },
      $defs: { Name: { $id: 'name', type: 'string' } },
    };
    const result = compiler.compile(source);
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(result.prepared.definition.data.schema).toEqual(source.definition.data.schema);
  });

  it('reports missing default-slot contracts at the original children shorthand', () => {
    const source = input();
    source.catalog.materials.input!.manifest.slots = [];
    source.definition.views.only = { material: 'input', children: [] };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'SLOT_NOT_DECLARED', sourcePointer: '/views/only/children' }),
    );
  });

  it('closes external business schema resources without doing network I/O', () => {
    const source = input();
    source.definition.data.schema = {
      $id: 'https://example.invalid/form',
      type: 'object',
      properties: { name: { $ref: 'name' } },
    };
    const result = compiler.compile({
      ...source,
      schemaResources: {
        'https://example.invalid/name': { type: 'string' },
        'https://example.invalid/unused': false,
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(result.prepared.resources.schemas).toEqual({
      'https://example.invalid/name': { type: 'string' },
    });
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_RESOURCE_MISSING' }),
    );
  });

  it('uses a resource $id as the base for relative references even when loaded through another key', () => {
    const source = input();
    source.definition.data.schema = { $ref: 'https://example.invalid/alias' };
    const result = compiler.compile({
      ...source,
      schemaResources: {
        'https://example.invalid/alias': {
          $id: 'https://example.invalid/models/person',
          type: 'object',
          properties: { name: { $ref: 'text' } },
        },
        'https://example.invalid/models/text': { type: 'string' },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(Object.keys(result.prepared.resources.schemas)).toEqual([
      'https://example.invalid/alias',
      'https://example.invalid/models/text',
    ]);
  });

  it('does not scan schema defaults or literal business JSON as references', () => {
    const source = input();
    source.definition.data.schema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: { $ref: 'https://missing.invalid/raw-data' } },
      },
    };
    expect(compiler.compile(source).success).toBe(true);
  });

  it('rebases JSON Pointer references when they cross an ancestor nested schema ID', () => {
    const source = input();
    source.definition.data.schema = {
      $id: 'https://example.invalid/root',
      type: 'object',
      properties: { name: { $ref: '#/$defs/Obj/$defs/X' } },
      $defs: { Obj: { $id: 'sub/base', $defs: { X: { $ref: 'name' } } } },
    };
    const result = compiler.compile({
      ...source,
      schemaResources: { 'https://example.invalid/sub/name': { type: 'string' } },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  });

  it('accepts identical resources under multiple retrieval aliases and emits the referenced alias', () => {
    const source = input();
    source.catalog.materials.input!.manifest.propsSchema = { $ref: 'https://example.invalid/z' };
    const schema = { $id: 'https://example.invalid/id', type: 'object' };
    const result = compiler.compile({
      ...source,
      schemaResources: { 'https://example.invalid/a': schema, 'https://example.invalid/z': schema },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(result.prepared.resources.schemas).toEqual({ 'https://example.invalid/z': schema });
  });

  it('preserves JSON Pointer fragments on additional retrieval aliases', () => {
    const source = input();
    source.catalog.materials.input!.manifest.propsSchema = {
      $ref: 'https://example.invalid/z#/$defs/Props',
    };
    const schema = { $id: 'https://example.invalid/id', $defs: { Props: { type: 'object' } } };
    const result = compiler.compile({
      ...source,
      schemaResources: { 'https://example.invalid/a': schema, 'https://example.invalid/z': schema },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  });

  it('normalizes empty schema ID fragments while resolving local references', () => {
    const source = input();
    source.definition.data.schema = {
      $id: 'https://example.invalid/root#',
      type: 'object',
      properties: { name: { $ref: '#/$defs/Name' } },
      $defs: { Name: { type: 'string' } },
    };
    expect(compiler.compile(source).success).toBe(true);
  });

  it('accepts a retrieval alias for a resource already nested in the business schema', () => {
    const source = input();
    const props = { $id: 'https://example.invalid/id', type: 'object' };
    source.definition.data.schema = {
      $id: 'https://example.invalid/root',
      type: 'object',
      $defs: { Props: props },
    };
    source.definition.views.only = { material: 'input', props: { label: 'label' } };
    source.catalog.materials.input!.manifest.propsSchema = { $ref: 'https://example.invalid/z' };
    const result = compiler.compile({
      ...source,
      schemaResources: { 'https://example.invalid/z': props },
    });
    expect(result.success).toBe(true);
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    expect(result.prepared.resources.schemas).toEqual({ 'https://example.invalid/z': props });
  });

  it('hashes canonical manifest content rather than the artifact digest', () => {
    const source = input();
    source.definition.views.only = { material: 'input' };
    source.catalog.materials.input!.manifest = { id: 'input', version: 'v1' };
    const result = compiler.compile(source);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.prepared.capabilityLock.materials.input!.manifestDigest).toBe(
        'sha256:630c906df280df64aa94aaff48b7a9172b43bcf1af71c804f9dcd1460922b56b',
      );
      expect(result.prepared.capabilityLock.materials.input!.artifact.digest).toBe(digest);
    }
  });

  it('checks optional target and format explicitly', () => {
    expect(errors(compiler.compile({ ...input(), target: { platform: 'native' } }))).toContainEqual(
      expect.objectContaining({ code: 'CAPABILITY_PLATFORM_MISMATCH' }),
    );
    expect(
      errors(compiler.compile({ ...input(), target: { preparedFormatVersion: 'unknown' } })),
    ).toContainEqual(expect.objectContaining({ code: 'PREPARED_FORMAT_UNSUPPORTED' }));
  });

  it('uses content-based deterministic manifest digests independently of object key order', () => {
    const left = input(),
      right = input();
    const original = right.catalog.materials.input!.manifest;
    right.catalog.materials.input!.manifest = {
      slots: original.slots,
      bindings: original.bindings,
      propsSchema: original.propsSchema,
      version: original.version,
      id: original.id,
    };
    expect(compiler.compile(left)).toEqual(compiler.compile(right));
    const before = compiler.compile(left);
    right.catalog.materials.input!.manifest.version = 'v2';
    const after = compiler.compile(right);
    expect(before.success && after.success).toBe(true);
    if (before.success && after.success)
      expect(before.prepared.capabilityLock.materials.input!.manifestDigest).not.toBe(
        after.prepared.capabilityLock.materials.input!.manifestDigest,
      );
  });

  it('does not treat inherited registry properties as capabilities or execute getters', () => {
    const source = input();
    source.definition.views.only = { material: 'toString' };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'MATERIAL_NOT_FOUND' }),
    );
    let calls = 0;
    Object.defineProperty(source.definition, 'metadata', {
      enumerable: true,
      get() {
        calls++;
        return {};
      },
    });
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'INPUT_NOT_JSON' }),
    );
    expect(calls).toBe(0);
  });

  it('supports JSON dictionary keys that collide with Object.prototype', () => {
    const source = input();
    source.definition.views = Object.fromEntries([
      ['__proto__', { material: 'input', bind: '/name' }],
    ]);
    const result = compiler.compile(source);
    expect(result.success).toBe(true);
    if (result.success)
      expect(Object.keys(result.prepared.definition.views)).toEqual(['__proto__']);
  });

  it.each(['cycle', 'nonfinite', 'class', 'depth'] as const)(
    'rejects unsafe %s inputs with diagnostics rather than exceptions',
    (kind) => {
      const source = input();
      if (kind === 'cycle')
        Object.assign(source.definition.metadata!, { self: source.definition.metadata });
      if (kind === 'nonfinite') source.definition.metadata = { value: Number.NaN };
      if (kind === 'class') Object.assign(source.definition, { metadata: new Date() });
      if (kind === 'depth') {
        let value: unknown = 1;
        for (let i = 0; i < 150; i++) value = { value };
        Object.assign(source.definition, { metadata: value });
      }
      expect(
        errors(compiler.compile(source)).some((d) =>
          ['INPUT_NOT_JSON', 'INPUT_BUDGET_EXCEEDED'].includes(d.code),
        ),
      ).toBe(true);
    },
  );

  it.each([
    (s: ReturnType<typeof input>) => {
      s.definition.expressions = { value: true };
    },
    (s: ReturnType<typeof input>) => {
      s.definition.reactions = [{ id: 'r', watch: [], then: [] }];
    },
    (s: ReturnType<typeof input>) => {
      s.definition.constraints = [
        {
          id: 'c',
          kind: 'internal',
          assert: true,
          issue: { target: { source: 'data', path: '' }, code: 'C' },
        },
      ];
    },
    (s: ReturnType<typeof input>) => {
      s.definition.views.only = { material: 'input', props: { label: { $expr: 'dynamic' } } };
    },
    (s: ReturnType<typeof input>) => {
      s.definition.views.only = {
        scope: { from: { source: 'data', path: '' }, as: 'root' },
        node: { material: 'input' },
      };
    },
  ])('fails closed for not-yet-implemented semantics', (mutate) => {
    const source = input();
    mutate(source);
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'FEATURE_NOT_IMPLEMENTED' }),
    );
  });

  it('rejects missing required request mappings before allowing a used material', () => {
    const source = input();
    source.catalog.materials.input!.manifest.requests = {
      search: { payloadSchema: { type: 'string' }, resultSchema: { type: 'array' } },
    };
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'REQUEST_MAPPING_MISSING' }),
    );
  });

  it('rejects malformed protocol wrappers and unknown API fields', () => {
    const source = input();
    Object.assign(source.definition.views.only!, { extra: true });
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'DEFINITION_INVALID' }),
    );
    expect(
      errors(compiler.compile({ ...input(), extra: true } as ReturnType<typeof input>)),
    ).toContainEqual(expect.objectContaining({ code: 'COMPILE_INPUT_INVALID' }));
  });

  it('diagnoses invalid SDK resource values without throwing from the Schema engine', () => {
    const source = { ...input(), schemaResources: { bad: 42 } } as unknown as Parameters<
      typeof compiler.compile
    >[0];
    expect(errors(compiler.compile(source))).toContainEqual(
      expect.objectContaining({ code: 'SCHEMA_RESOURCE_INVALID' }),
    );
  });
});

describe('standalone capability contract checks', () => {
  it('checks a Manifest without needing a definition, catalog or implementation', () => {
    expect(compiler.validateMaterialManifest(input().catalog.materials.input!.manifest)).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(
      compiler.validatePureFunctionManifest({
        id: 'business.f',
        version: 'v1',
        parameters: [{ name: 'n', schema: { type: 'number' } }],
        returns: { type: 'number' },
      }).valid,
    ).toBe(true);
  });
  it('distinguishes invalid structure from invalid optional parameter ordering', () => {
    expect(
      compiler.validateMaterialManifest({
        id: 'bad',
        version: 'v1',
        requests: { query: { payloadSchema: true } },
      }).valid,
    ).toBe(false);
    expect(
      compiler.validatePureFunctionManifest({
        id: 'f',
        version: 'v1',
        parameters: [
          { name: 'x', schema: true, optional: true },
          { name: 'y', schema: true },
        ],
        returns: true,
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_PARAMETER_ORDER', sourcePointer: '/parameters/1' }),
    );
  });
  it('reports malformed used contracts at catalog locations and avoids cascades', () => {
    const source = input();
    source.catalog.materials.input!.manifest.id = 'other';
    const diagnostics = errors(compiler.compile(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CAPABILITY_ID_MISMATCH',
        relatedLocations: expect.arrayContaining([
          expect.objectContaining({
            sourceId: 'catalog-fixed',
            pointer: '/materials/input/manifest/id',
          }),
        ]),
      }),
    );
    expect(diagnostics.some((d) => d.code === 'PROPS_INVALID')).toBe(false);
  });
});
