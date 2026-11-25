import { describe, expect, it } from 'vitest';
import { compile } from '../../src/index.js';
import type { CompileInput } from '../../src/index.js';
import type { Expression } from '@form-engine/protocol/definition';
import { input, digest } from '../fixtures.js';

const data = (path: string, scope?: string) => ({
  source: 'data' as const,
  path,
  ...(scope ? { scope } : {}),
});
const ref = (path: string, scope?: string): Expression => ({ ref: data(path, scope) });
function source(): CompileInput {
  const value = input();
  value.catalog.materials.input!.manifest.propsSchema = true;
  value.catalog.pureFunctions['core.lt'] = {
    manifest: {
      id: 'core.lt',
      version: 'v1',
      parameters: [
        { name: 'a', schema: { type: 'number' } },
        { name: 'b', schema: { type: 'number' } },
      ],
      returns: { type: 'boolean' },
    },
    artifact: { id: 'core-build', platform: 'web', digest },
  };
  return value;
}
function prepared(value: CompileInput) {
  const result = compile(value);
  if (!result.success) throw Error(JSON.stringify(result.diagnostics));
  return result.prepared;
}
function codes(value: CompileInput) {
  const result = compile(value);
  expect(result.success).toBe(false);
  expect(result).not.toHaveProperty('prepared');
  return result.diagnostics.map((diagnostic) => diagnostic.code);
}

describe('shared expression analysis and generated watch', () => {
  it('adds independent watch per complete expression without changing the AST or ordinary watch props', () => {
    const value = source();
    const expression: Expression = { op: 'core.lt', args: [ref('/age'), 18] };
    value.definition.views.only = {
      material: 'input',
      props: {
        disabled: { $expr: expression },
        caption: { $expr: ref('/name') },
        nested: [{ count: { $expr: 3 } }],
        watch: 'ordinary business prop',
        raw: { $literal: { $expr: { ref: data('/missing') } } },
      },
    };
    const before = structuredClone(value);
    const result = prepared(value);
    expect(result.definition.views.only).toMatchObject({
      props: {
        disabled: { $expr: expression, watch: [data('/age')] },
        caption: { $expr: ref('/name'), watch: [data('/name')] },
        nested: [{ count: { $expr: 3, watch: [] } }],
        watch: 'ordinary business prop',
        raw:
          before.definition.views.only && 'props' in before.definition.views.only
            ? before.definition.views.only.props!.raw
            : undefined,
      },
    });
    expect(result.capabilityLock.pureFunctions['core.lt']).toMatchObject({
      id: 'core.lt',
      artifact: { digest },
    });
    expect(value).toEqual(before);
  });

  it('follows forward named expressions, deduplicates reads and locks functions in retained unused expressions', () => {
    const value = source();
    value.definition.expressions = {
      first: { use: 'second' },
      second: { op: 'core.lt', args: [ref('/age'), ref('/age')] },
      unused: { op: 'core.lt', args: [0, 1] },
    };
    value.definition.views.only = {
      material: 'input',
      props: { disabled: { $expr: { use: 'first' } } },
    };
    expect(prepared(value).definition.views.only).toMatchObject({
      props: {
        disabled: { $expr: { use: 'first' }, watch: [data('/age')] },
      },
    });
    value.definition.expressions.second = { use: 'first' };
    expect(codes(value)).toContain('EXPRESSION_CYCLE');
    value.definition.expressions.second = { use: 'absent' };
    expect(codes(value)).toContain('EXPRESSION_NOT_FOUND');
  });

  it('collects every possible branch without evaluating functions or scanning literal values', () => {
    const value = source();
    value.catalog.pureFunctions['core.if'] = {
      manifest: {
        id: 'core.if',
        version: 'v1',
        parameters: [
          { name: 'condition', schema: { type: 'boolean' } },
          { name: 'yes', schema: true },
          { name: 'no', schema: true },
        ],
        returns: { type: 'string' },
      },
      artifact: { id: 'core-build', platform: 'web', digest },
    };
    value.definition.views.only = {
      material: 'input',
      props: {
        label: {
          $expr: {
            op: 'core.if',
            args: [false, ref('/name'), { literal: { ref: data('/missing') } }],
          },
        },
      },
    };
    expect(prepared(value).definition.views.only).toMatchObject({
      props: { label: { watch: [data('/name')] } },
    });
  });

  it('checks function lookup, parameter types, arity, optional and rest signatures', () => {
    const value = source();
    const set = (expression: Expression) => {
      value.definition.views.only = { material: 'input', props: { result: { $expr: expression } } };
    };
    set({ op: 'missing', args: [] });
    expect(codes(value)).toContain('FUNCTION_NOT_FOUND');
    set({ op: 'core.lt', args: [ref('/name'), 18] });
    expect(codes(value)).toContain('FUNCTION_ARGUMENT_INCOMPATIBLE');
    set({ op: 'core.lt', args: [1] });
    expect(codes(value)).toContain('FUNCTION_ARITY_INVALID');
    const manifest = value.catalog.pureFunctions['core.lt']!.manifest;
    manifest.parameters[1]!.optional = true;
    expect(prepared(value).capabilityLock.pureFunctions).toHaveProperty('core.lt');
    manifest.restParameter = { name: 'rest', schema: { type: 'number' } };
    set({ op: 'core.lt', args: [1, 2, 3, 4] });
    expect(prepared(value).definition.views.only).toBeDefined();
    set({ op: 'core.lt', args: [1, 2, 'bad'] });
    expect(codes(value)).toContain('FUNCTION_ARGUMENT_INCOMPATIBLE');
  });

  it('proves conditional Props and narrows nullable types only after a short-circuit guard', () => {
    const value = source();
    const bool = { type: 'boolean' } as const;
    const primitive = { type: ['integer', 'null'] };
    const register = (
      id: string,
      parameters: CompileInput['catalog']['pureFunctions'][string]['manifest']['parameters'],
      returns: CompileInput['catalog']['pureFunctions'][string]['manifest']['returns'],
    ) => {
      value.catalog.pureFunctions[id] = {
        manifest: { id, version: '1', parameters, returns },
        artifact: { id: 'core-build', platform: 'web', digest },
      };
    };
    register('nullableAge', [], primitive);
    register(
      'core.ne',
      ['a', 'b'].map((name) => ({ name, schema: primitive })),
      bool,
    );
    register(
      'core.and',
      ['a', 'b'].map((name) => ({ name, schema: bool })),
      bool,
    );
    register(
      'core.if',
      [
        { name: 'condition', schema: bool },
        { name: 'then', schema: true },
        { name: 'else', schema: true },
      ],
      true,
    );
    value.catalog.materials.input!.manifest.propsSchema = {
      type: 'object',
      properties: { disabled: bool },
    };
    const age = { op: 'nullableAge', args: [] };
    const guard = { op: 'core.ne', args: [age, null] };
    const comparison = { op: 'core.lt', args: [age, 18] };
    const set = (args: Expression[], fallback: Expression = false) => {
      value.definition.views.only = {
        material: 'input',
        props: {
          disabled: { $expr: { op: 'core.if', args: [true, { op: 'core.and', args }, fallback] } },
        },
      };
    };
    set([guard, comparison]);
    expect(prepared(value).definition.views.only).toBeDefined();
    set([comparison, guard]);
    expect(codes(value)).toContain('FUNCTION_ARGUMENT_INCOMPATIBLE');
    set([guard, comparison], 'choice');
    expect(codes(value)).toContain('PROPS_UNPROVEN');
    register('nullableAge', [{ name: 'value', schema: { type: 'number' } }], primitive);
    set([
      { op: 'core.ne', args: [{ op: 'nullableAge', args: [0] }, null] },
      { op: 'core.lt', args: [{ op: 'nullableAge', args: [-0] }, 18] },
    ]);
    expect(codes(value)).toContain('FUNCTION_ARGUMENT_INCOMPATIBLE');
  });

  it('checks dynamic Props shape against the manifest and keeps static value restrictions', () => {
    const value = source();
    value.catalog.materials.input!.manifest.propsSchema = {
      type: 'object',
      properties: { disabled: { type: 'boolean' }, label: { type: 'string', minLength: 2 } },
      required: ['disabled'],
      additionalProperties: false,
    };
    value.definition.views.only = {
      material: 'input',
      props: {
        disabled: { $expr: { op: 'core.lt', args: [ref('/age'), 18] } },
        label: 'ok',
      },
    };
    expect(prepared(value).definition.views.only).toBeDefined();
    value.definition.views.only.props!.label = '';
    expect(codes(value)).toContain('PROPS_INVALID');
    value.definition.views.only.props!.label = 'ok';
    value.definition.views.only.props!.disabled = { $expr: ref('/age') };
    expect(codes(value)).toContain('PROPS_INCOMPATIBLE');
    value.definition.views.only.props!.disabled = { $expr: true };
    value.definition.views.only.props!.label = '';
    expect(codes(value)).toContain('PROPS_INVALID');
  });

  it('binds lexical each models while keeping symbolic scope watch and preventing named capture', () => {
    const value = source();
    value.definition.data.schema = {
      type: 'object',
      properties: {
        people: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    };
    value.definition.views.only = {
      scope: { from: data('/people'), as: 'person', mode: 'each' },
      node: {
        material: 'input',
        bindings: { value: data('/name', 'person') },
        props: { label: { $expr: ref('/name', 'person') } },
      },
    };
    expect(prepared(value).definition.views.only).toMatchObject({
      scope: { as: 'person', mode: 'each' },
      node: { props: { label: { watch: [data('/name', 'person')] } } },
    });
    value.definition.expressions = { captured: ref('/name', 'person') };
    expect(codes(value)).toContain('SCOPE_NOT_VISIBLE');
  });

  it('collects Constraint dependencies but preserves Reaction explicit triggers and on-demand values', () => {
    const value = source();
    const condition: Expression = { op: 'core.lt', args: [ref('/age'), 18] };
    value.definition.constraints = [
      {
        id: 'minor',
        kind: 'internal',
        assert: condition,
        issue: { target: data('/name'), code: 'MINOR' },
      },
      {
        id: 'remote',
        kind: 'external',
        validator: 'check',
        watch: [data('/name')],
        when: condition,
        target: data('/name'),
      },
    ];
    value.definition.reactions = [
      {
        id: 'copy',
        watch: [data('/name')],
        when: condition,
        then: [{ op: 'set', target: data('/name'), value: { $expr: ref('/age') } }],
      },
    ];
    const result = prepared(value);
    expect(result.definition.constraints).toMatchObject([
      { id: 'minor', watch: [data('/age')] },
      { id: 'remote', watch: [data('/age'), data('/name')] },
    ]);
    expect(result.definition.reactions).toMatchObject([
      { watch: [data('/name')], runOnActivate: false, then: [{ value: { $expr: ref('/age') } }] },
    ]);
    expect(JSON.stringify(result.definition.reactions)).not.toContain(
      '"watch":[{"source":"data","path":"/age"}]',
    );
    expect(result.hostRequirements.validators).toEqual([
      { name: 'check', constraintIds: ['remote'] },
    ]);
  });

  it('propagates prerequisite dependencies, rejects cycles and does not use issue targets as inputs', () => {
    const value = source();
    value.definition.constraints = [
      {
        id: 'b',
        kind: 'internal',
        assert: true,
        requires: [{ kind: 'constraint', constraintId: 'a' }],
        issue: { target: data('/name'), code: 'B' },
      },
      {
        id: 'a',
        kind: 'internal',
        assert: { op: 'core.lt', args: [ref('/age'), 18] },
        issue: { target: data('/name'), code: 'A' },
      },
    ];
    expect(prepared(value).definition.constraints).toMatchObject([
      { id: 'b', watch: [data('/age')] },
      { id: 'a', watch: [data('/age')] },
    ]);
    value.definition.constraints[1]!.requires = [{ kind: 'constraint', constraintId: 'b' }];
    expect(codes(value)).toContain('PREREQUISITE_CYCLE');
  });

  it('rejects boolean misuse, illegal event references and absent Context type evidence', () => {
    const value = source();
    value.definition.constraints = [
      {
        id: 'bad',
        kind: 'internal',
        assert: ref('/name'),
        issue: { target: data('/name'), code: 'BAD' },
      },
    ];
    expect(codes(value)).toContain('EXPRESSION_RESULT_INCOMPATIBLE');
    delete value.definition.constraints;
    value.definition.views.only = {
      material: 'input',
      props: { x: { $expr: { ref: { source: 'event', path: '' } } } },
    };
    expect(codes(value)).toContain('EVENT_NOT_AVAILABLE');
    value.catalog.materials.input!.manifest.propsSchema = {
      type: 'object',
      properties: { x: { type: 'boolean' } },
    };
    value.definition.views.only.props!.x = { $expr: { ref: { source: 'context', path: '/flag' } } };
    expect(codes(value)).toContain('PROPS_UNPROVEN');
  });

  it('proves simple union / constructed array connections and observes whole-object function inputs', () => {
    const value = source();
    value.definition.data.schema = {
      type: 'object',
      properties: {
        profile: { type: 'object' },
        amount: { anyOf: [{ type: 'integer' }, { type: 'number' }] },
      },
    };
    value.catalog.pureFunctions['business.summary'] = {
      manifest: {
        id: 'business.summary',
        version: 'v1',
        parameters: [{ name: 'profile', schema: { type: 'object' } }],
        returns: { type: 'string' },
      },
      artifact: { id: 'business-build', platform: 'web', digest },
    };
    value.catalog.materials.input!.manifest.propsSchema = {
      type: 'object',
      properties: {
        labels: { type: 'array', items: { type: 'string' } },
        amount: { type: 'number' },
      },
    };
    value.definition.views.only = {
      material: 'input',
      props: {
        labels: ['static', { $expr: { op: 'business.summary', args: [ref('/profile')] } }],
        amount: { $expr: ref('/amount') },
      },
    };
    expect(prepared(value).definition.views.only).toMatchObject({
      props: {
        labels: ['static', { watch: [data('/profile')] }],
        amount: { watch: [data('/amount')] },
      },
    });
  });
  it('bounds long external Schema reference chains before recursively scanning them', () => {
    const value = source();
    value.definition.data.schema = { $ref: 'https://example.test/r0' };
    value.definition.views.only = { material: 'input' };
    value.schemaResources = Object.fromEntries(
      Array.from({ length: 150 }, (_, i) => [
        'https://example.test/r' + i,
        i < 149 ? { $ref: 'https://example.test/r' + (i + 1) } : true,
      ]),
    );
    expect(codes(value)).toContain('SCHEMA_BUDGET_EXCEEDED');
  });
  it('terminates recursive union proofs without expanding duplicate branches exponentially', () => {
    const value = source();
    value.definition.data.schema = {
      type: 'object',
      properties: { value: { $ref: '#/$defs/Recursive' } },
      $defs: {
        Recursive: { anyOf: [{ $ref: '#/$defs/Recursive' }, { $ref: '#/$defs/Recursive' }] },
      },
    };
    value.definition.views.only = { material: 'input', bindings: { value: data('/value') } };
    expect(codes(value)).toContain('BINDING_UNPROVEN');
  });
});
