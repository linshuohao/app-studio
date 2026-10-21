import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  arrayDefinition,
  capabilityCatalog,
  functionManifest,
  materialManifest,
  preparedForm,
  simpleDefinition,
} from './fixtures.js';

const ajv = new Ajv2020({
  strict: true,
  allowUnionTypes: true,
  strictRequired: false,
  allErrors: true,
  validateFormats: false,
});
function validator(name: string) {
  const schema = JSON.parse(
    readFileSync(new URL(`../schemas/${name}.schema.json`, import.meta.url), 'utf8'),
  );
  return ajv.compile(schema);
}
const definition = validator('form-definition');
const valueSpec = validator('value-spec');
const expression = validator('expression');
const command = validator('command');
const material = validator('material-manifest');
const pureFunction = validator('pure-function-manifest');
const host = validator('host-contract');
const catalog = validator('capability-catalog-snapshot');
const prepared = validator('prepared-form');
const authoring = validator('authoring-form-definition');
const target = { source: 'data', path: '/members' };

describe('Definition and recursive expression grammar', () => {
  it('accepts simple and nested-array / multi-profile contracts without mutating input', () => {
    for (const input of [simpleDefinition, arrayDefinition]) {
      const before = JSON.stringify(input);
      expect(definition(input), JSON.stringify(definition.errors)).toBe(true);
      expect(JSON.stringify(input)).toBe(before);
    }
  });
  it('accepts expressions at arbitrary object/array depth and literal marker data', () => {
    expect(
      valueSpec({
        a: [{ b: { $expr: { op: 'core.if', args: [true, { literal: { ref: 'raw' } }, null] } } }],
      }),
    ).toBe(true);
    expect(valueSpec({ $literal: { $expr: 1, $literal: { arbitrary: true }, extra: [] } })).toBe(
      true,
    );
    expect(expression({ literal: { ref: 42, use: 'not-an-expression' } })).toBe(true);
  });
  it.each([
    { $expr: 1, extra: true },
    { $expr: 1, $literal: 1 },
    { $expr: { op: 'core.eq' } },
    { deep: [{ $literal: 1, extra: true }] },
    { $literal: { x: 1 }, $expr: 0 },
  ])('rejects malformed wrappers instead of accepting the dictionary branch: %j', (input) => {
    expect(valueSpec(input)).toBe(false);
  });
  it.each([
    { ref: { source: 'data', path: '/name' }, use: 'another' },
    { op: 'core.eq', args: [], literal: false },
    { ref: { source: 'event', path: '/selected', scope: 'forbidden' } },
    { ref: { source: 'context', path: '/a~2b' } },
  ])('rejects mixed branches and malformed references: %j', (input) =>
    expect(expression(input)).toBe(false),
  );
  it('preserves arbitrary metadata and does not scan Schema literals as expressions', () => {
    expect(
      definition({
        ...simpleDefinition,
        metadata: { $expr: 'ordinary data' },
        data: { schema: { const: { $expr: { any: 'JSON' } } } },
      }),
    ).toBe(true);
  });
  it('validates embedded standard JSON Schema grammar', () => {
    expect(definition({ ...simpleDefinition, data: { schema: { type: 'made-up-type' } } })).toBe(
      false,
    );
    expect(definition({ ...simpleDefinition, data: { schema: false } })).toBe(true);
  });
  it('keeps Authoring shorthands out of Canonical', () => {
    const input = {
      ...simpleDefinition,
      views: {
        desktop: { material: 'stack', children: [{ material: 'text-input', bind: '/name' }] },
      },
    };
    expect(authoring(input)).toBe(true);
    expect(definition(input)).toBe(false);
  });
  it.each(['name', '/bad~2escape'])('rejects malformed Authoring binding pointers: %s', (bind) => {
    expect(
      authoring({ ...simpleDefinition, views: { desktop: { material: 'text-input', bind } } }),
    ).toBe(false);
  });
  it('rejects unknown fields and retired External configuration', () => {
    expect(definition({ ...simpleDefinition, unknown: true })).toBe(false);
    const external = { id: 'check', kind: 'external', validator: 'phone.check', watch: [], target };
    expect(definition({ ...simpleDefinition, constraints: [external] })).toBe(true);
    for (const added of [{ requiredForSubmit: false }, { dependsOn: [] }, { payload: {} }]) {
      expect(definition({ ...simpleDefinition, constraints: [{ ...external, ...added }] })).toBe(
        false,
      );
    }
    expect(
      definition({ ...simpleDefinition, constraints: [{ ...external, validator: undefined }] }),
    ).toBe(false);
  });
  it('requires nonempty ordered binder chains and explicit sync field prerequisites', () => {
    const rule = { id: 'check', kind: 'internal', assert: true, issue: { target, code: 'bad' } };
    expect(definition({ ...simpleDefinition, constraints: [{ ...rule, scope: [] }] })).toBe(false);
    expect(
      definition({
        ...simpleDefinition,
        constraints: [{ ...rule, scope: [{ from: target, as: 'member', mode: 'each' }] }],
      }),
    ).toBe(true);
    expect(
      definition({
        ...simpleDefinition,
        constraints: [{ ...rule, requires: [{ kind: 'field', target, phase: 'async' }] }],
      }),
    ).toBe(false);
  });
});

describe('Commands and material/Host contracts', () => {
  it('accepts all seven command variants and nested ordered batches', () => {
    const item = { $scope: 'member' };
    const commands = [
      { op: 'set', target, value: { $literal: [] } },
      { op: 'patch', target, value: { arbitrary: { $expr: 1 } } },
      { op: 'remove', target },
      { op: 'array.insert', target, position: { kind: 'index', index: 0 }, value: {} },
      { op: 'array.remove', target, item },
      { op: 'array.move', target, item, position: { kind: 'after', item: { $scope: 'other' } } },
      { op: 'batch', commands: [{ op: 'remove', target }] },
    ];
    expect(command({ op: 'batch', commands }), JSON.stringify(command.errors)).toBe(true);
  });
  it.each([-1, 0.5])('rejects structurally invalid numeric positions: %s', (index) => {
    expect(
      command({ op: 'array.insert', target, position: { kind: 'index', index }, value: null }),
    ).toBe(false);
  });
  it('rejects missing values, mixed positions and writes to read-only reference sources', () => {
    expect(command({ op: 'set', target })).toBe(false);
    expect(command({ op: 'set', target: { source: 'context', path: '' }, value: 1 })).toBe(false);
    expect(
      command({
        op: 'array.insert',
        target,
        position: { kind: 'index', index: 0, item: { $scope: 'a' } },
        value: null,
      }),
    ).toBe(false);
  });
  it('accepts named typed bindings, unrestricted slots and payload contracts', () => {
    expect(material(materialManifest), JSON.stringify(material.errors)).toBe(true);
    expect(pureFunction(functionManifest)).toBe(true);
    expect(catalog(capabilityCatalog)).toBe(true);
    expect(
      host({
        validators: { check: { contractVersion: 'test' } },
        events: { ping: { optional: true }, select: { payloadSchema: { type: 'string' } } },
      }),
    ).toBe(true);
  });
  it('rejects permission/slot-count/event-return DSLs', () => {
    expect(
      material({ ...materialManifest, bindings: { value: { schema: true, access: 'read' } } }),
    ).toBe(false);
    expect(material({ ...materialManifest, slots: ['default', 'default'] })).toBe(false);
    expect(material({ ...materialManifest, slots: { default: { maxItems: 1 } } })).toBe(false);
    expect(material({ ...materialManifest, events: { select: { returns: true } } })).toBe(false);
  });
});

describe('Prepared interchange boundary', () => {
  it('accepts complete static JSON and preserves it through round-trip', () => {
    const input = JSON.parse(JSON.stringify(preparedForm));
    expect(prepared(input), JSON.stringify(prepared.errors)).toBe(true);
    expect(input).toEqual(preparedForm);
  });
  it('rejects instance data, pending state, legacy plans and malformed locks', () => {
    expect(prepared({ ...preparedForm, data: {} })).toBe(false);
    expect(
      prepared({ ...preparedForm, definition: { ...preparedForm.definition, pending: [] } }),
    ).toBe(false);
    expect(prepared({ ...preparedForm, formPlan: {} })).toBe(false);
    expect(
      prepared({
        ...preparedForm,
        capabilityLock: {
          materials: {
            input: {
              id: 'input',
              version: 'x',
              manifestDigest: 'sha256:invalid',
              artifact: { id: 'x', platform: 'web', digest: 'sha256:invalid' },
            },
          },
          pureFunctions: {},
        },
      }),
    ).toBe(false);
  });
});

describe('material request contracts', () => {
  const signature = { payloadSchema: { type: 'string' }, resultSchema: { type: 'array' } };
  const mapping = { type: 'host.request', request: 'address.lookup' };
  it('accepts independent material and Host signatures and Definition parameter mapping', () => {
    expect(material({ ...materialManifest, requests: { search: signature } })).toBe(true);
    expect(host({ requests: { 'address.lookup': signature } })).toBe(true);
    expect(
      definition({
        ...simpleDefinition,
        views: {
          desktop: {
            material: 'address-picker',
            requests: {
              search: {
                ...mapping,
                payload: { keyword: { $expr: { ref: { source: 'event', path: '' } } } },
              },
            },
          },
        },
      }),
    ).toBe(true);
  });
  it('rejects incomplete signatures, unknown concurrency and the removed service registry', () => {
    for (const request of [
      { payloadSchema: true },
      { resultSchema: true },
      { ...signature, concurrency: 'queue' },
      { ...signature, resultSchema: { type: 'unknown' } },
    ])
      expect(material({ ...materialManifest, requests: { search: request } })).toBe(false);
    expect(material({ ...materialManifest, services: {} })).toBe(false);
    expect(host({ services: {} })).toBe(false);
    expect(host({ requests: { search: { ...signature, concurrency: 'latest' } } })).toBe(false);
  });
  it('keeps requests separate from notification intents and rejects malformed mappings', () => {
    for (const node of [
      { on: { search: mapping } },
      { requests: { search: { type: 'host.emit', event: 'search' } } },
      { requests: { search: { type: 'host.request' } } },
    ])
      expect(
        definition({ ...simpleDefinition, views: { desktop: { material: 'picker', ...node } } }),
      ).toBe(false);
  });
  it('requires explicit Prepared concurrency and request schema resources', () => {
    const root = preparedForm.definition.views.desktop;
    const request = {
      ...mapping,
      concurrency: 'latest',
      payloadSchemaRef: 'input',
      resultSchemaRef: 'output',
    };
    const make = (entry: object) => ({
      ...preparedForm,
      definition: {
        ...preparedForm.definition,
        views: { desktop: { ...root, requests: { search: entry } } },
      },
      resources: {
        schemas: {},
        requestSchemas: { input: signature.payloadSchema, output: signature.resultSchema },
      },
      hostRequirements: {
        validators: [],
        events: [],
        requests: [{ name: 'address.lookup', nodeIds: ['name-input'] }],
      },
    });
    const valid = make(request);
    expect(prepared(valid)).toBe(true);
    expect(prepared(make({ ...request, concurrency: 'parallel' }))).toBe(true);
    const { requestSchemas: missingResources, ...withoutResources } = valid.resources;
    void missingResources;
    expect(prepared({ ...valid, resources: withoutResources })).toBe(false);
    const { requests: missingMappings, ...withoutMappings } = valid.definition.views.desktop;
    void missingMappings;
    // Catalog-dependent required mappings remain a Compiler check, not a structural claim.
    expect(
      prepared({
        ...valid,
        definition: { ...valid.definition, views: { desktop: withoutMappings } },
      }),
    ).toBe(true);
    const { requests: missingRequirements, ...withoutRequirements } = valid.hostRequirements;
    void missingRequirements;
    expect(prepared({ ...valid, hostRequirements: withoutRequirements })).toBe(false);
    expect(prepared(make({ ...request, concurrency: 'queue' }))).toBe(false);
    const { concurrency: omitted, ...incomplete } = request;
    void omitted;
    expect(prepared(make(incomplete))).toBe(false);
    expect(
      prepared({ ...preparedForm, hostRequirements: { validators: [], events: [], services: [] } }),
    ).toBe(false);
  });
});
