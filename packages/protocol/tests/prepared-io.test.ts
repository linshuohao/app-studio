import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { simpleDefinition } from './fixtures.js';
import type {
  PreparedExpressionValue,
  PreparedInteractionIntent,
  PreparedOnDemandValueSpec,
  PreparedValueSpec,
} from '../src/prepared/index.js';

const ajv = new Ajv2020({
  strict: true,
  allowUnionTypes: true,
  strictRequired: false,
  validateFormats: false,
});
const prepared = ajv.compile(
  JSON.parse(
    readFileSync(new URL('../schemas/prepared-form.schema.json', import.meta.url), 'utf8'),
  ),
);
const authoring = ajv.compile(
  JSON.parse(
    readFileSync(
      new URL('../schemas/authoring-form-definition.schema.json', import.meta.url),
      'utf8',
    ),
  ),
);
const ref = { source: 'data', path: '/name' };
const expression = { ref };
const base = {
  preparedFormatVersion: 'test-prepared',
  build: { compilerVersion: 'test-compiler', catalogSnapshotId: 'test-catalog', profile: 'only' },
  definition: {
    ...simpleDefinition,
    views: { only: { id: 'name-input', material: 'text-input', bindings: { value: ref } } },
  },
  resources: { schemas: {}, requestSchemas: {} },
  capabilityLock: { materials: {}, pureFunctions: {} },
  hostRequirements: { validators: [], events: [], requests: [] },
};
function withProps(props: object) {
  return {
    ...base,
    definition: {
      ...base.definition,
      views: { only: { ...base.definition.views.only, props } },
    },
  };
}

describe('prepared input/output contract', () => {
  it('accepts one view with preserved references and no global platform', () => {
    const input = structuredClone(base);
    expect(prepared(input), JSON.stringify(prepared.errors)).toBe(true);
    expect(input).toEqual(base);
  });

  it('accepts per-expression watches inside nested props and business watch properties', () => {
    expect(
      prepared(
        withProps({
          watch: { $expr: expression, watch: [ref] },
          badge: [{ visible: { $expr: true, watch: [] } }],
          settings: { watch: 'business-data' },
          raw: { $literal: { $expr: 'data', watch: ['data'], extra: true } },
        }),
      ),
      JSON.stringify(prepared.errors),
    ).toBe(true);
  });

  it.each([
    { $expr: expression },
    { $expr: expression, watch: [ref], extra: true },
    { $expr: expression, watch: [ref], $literal: null },
    { $expr: expression, watch: [{ source: 'event', path: '' }] },
    { $expr: expression, watch: [{ source: 'data', path: ['name'] }] },
    { $expr: expression, watch: [{ source: 'data', path: '/a~2b' }] },
    { $expr: expression, watch: [{ ...ref, aspect: 'unknown' }] },
  ])('rejects incomplete or malformed reactive wrappers: %j', (value) => {
    expect(prepared(withProps({ value }))).toBe(false);
  });

  it('keeps templates, scope binders, and lexical references without expansion', () => {
    expect(
      prepared({
        ...base,
        definition: {
          ...base.definition,
          views: {
            only: {
              scope: { from: ref, as: 'member', mode: 'each' },
              node: { $use: 'card', with: { person: { ...ref, scope: 'member', path: '' } } },
            },
          },
          viewTemplates: {
            card: {
              params: { person: { schemaRef: '#/$defs/Person' } },
              node: {
                id: 'template-name',
                material: 'text-input',
                props: {
                  label: {
                    $expr: { ref: { source: 'data', scope: 'person', path: '/name' } },
                    watch: [{ source: 'data', scope: 'person', path: '/name' }],
                  },
                },
              },
            },
          },
        },
      }),
      JSON.stringify(prepared.errors),
    ).toBe(true);
  });

  it('requires normalized scope modes at every Prepared binder position', () => {
    const scope = { from: ref, as: 'member' };
    const validScope = { ...scope, mode: 'one' };
    function withScope(value: object) {
      return {
        ...base,
        definition: {
          ...base.definition,
          views: { only: { scope: value, node: base.definition.views.only } },
        },
      };
    }
    expect(prepared(withScope(validScope))).toBe(true);
    expect(prepared(withScope(scope))).toBe(false);
    const rule = { id: 'R', watch: [ref], runOnActivate: false, then: [], scope };
    expect(prepared({ ...base, definition: { ...base.definition, reactions: [rule] } })).toBe(
      false,
    );
    expect(
      prepared({
        ...base,
        definition: { ...base.definition, reactions: [{ ...rule, scope: [validScope, scope] }] },
      }),
    ).toBe(false);
  });

  it('keeps rule arrays with direct watches and resolved field prerequisites', () => {
    const constraint = {
      id: 'nonempty',
      kind: 'internal',
      assert: true,
      issue: { target: ref, code: 'EMPTY' },
      watch: [ref, { ...ref, aspect: 'structure' }],
    };
    const external = {
      id: 'unique',
      kind: 'external',
      validator: 'name.unique',
      target: ref,
      watch: [ref],
      requires: [{ kind: 'field', target: ref, phase: 'sync', constraintIds: ['nonempty'] }],
    };
    const input = {
      ...base,
      definition: {
        ...base.definition,
        constraints: [constraint, external],
        reactions: [
          {
            id: 'clear',
            watch: [ref],
            runOnActivate: false,
            then: [{ op: 'remove', target: ref }],
          },
        ],
      },
    };
    expect(prepared(input), JSON.stringify(prepared.errors)).toBe(true);
    const missingWatch = structuredClone(input);
    Reflect.deleteProperty(missingWatch.definition.constraints[0]!, 'watch');
    expect(prepared(missingWatch)).toBe(false);
    const unresolved = structuredClone(external);
    Reflect.deleteProperty(unresolved.requires[0]!, 'constraintIds');
    expect(
      prepared({
        ...input,
        definition: { ...input.definition, constraints: [constraint, unresolved] },
      }),
    ).toBe(false);
  });

  it('accepts call-time expressions without watches and rejects reactive wrappers in payloads', () => {
    const payload = { name: { $expr: expression } };
    function withPayload(value: object) {
      return {
        ...base,
        definition: {
          ...base.definition,
          views: {
            only: {
              ...base.definition.views.only,
              on: { click: { type: 'host.emit', event: 'save', payload: value } },
            },
          },
        },
      };
    }
    expect(prepared(withPayload(payload)), JSON.stringify(prepared.errors)).toBe(true);
    expect(prepared(withPayload({ name: { $expr: expression, watch: [ref] } }))).toBe(false);
  });

  it('rejects legacy plans, runtime identities, and multiple selected views', () => {
    expect(prepared({ ...base, formPlan: {} })).toBe(false);
    expect(prepared({ ...base, preparation: {} })).toBe(false);
    expect(prepared({ ...base, definition: { ...base.definition, views: {} } })).toBe(false);
    expect(
      prepared({
        ...base,
        definition: {
          ...base.definition,
          views: { ...base.definition.views, second: base.definition.views.only },
        },
      }),
    ).toBe(false);
    expect(
      prepared(withProps({ name: { $expr: expression, watch: [{ ...ref, scopeId: 'live' }] } })),
    ).toBe(false);
  });

  it('accepts canonical and shorthand definitions through the same authoring structure', () => {
    expect(authoring(simpleDefinition)).toBe(true);
    expect(
      authoring({
        ...simpleDefinition,
        views: { only: { material: 'text-input', bind: '/name' } },
      }),
    ).toBe(true);
    expect(
      authoring({
        ...simpleDefinition,
        views: {
          only: { material: 'input', props: { value: { $expr: expression, watch: [ref] } } },
        },
      }),
    ).toBe(false);
  });

  it('exposes the same strict expression-wrapper boundary to TypeScript consumers', () => {
    // @ts-expect-error a reactive expression must not escape into the ordinary-object branch
    const missing: PreparedValueSpec = { $expr: true };
    // @ts-expect-error the ordinary-object branch cannot accept a malformed reactive watch
    const malformed: PreparedValueSpec = { $expr: true, watch: 'wrong' };
    // @ts-expect-error invocation-time wrappers cannot acquire a reactive watch
    const payload: PreparedOnDemandValueSpec = { $expr: true, watch: [] };
    const reactive: PreparedExpressionValue = { $expr: true, watch: [] };
    // @ts-expect-error variable reuse must not bypass the on-demand boundary either
    const reusedPayload: PreparedOnDemandValueSpec = reactive;
    const reusedIntent: PreparedInteractionIntent = {
      type: 'host.emit',
      event: 'save',
      // @ts-expect-error event payloads are evaluated on invocation, never subscribed
      payload: reactive,
    };
    void missing;
    void malformed;
    void payload;
    void reusedPayload;
    void reusedIntent;
    const business: PreparedValueSpec = { watch: 'business-value' };
    expect(business).toEqual({ watch: 'business-value' });
  });
});
