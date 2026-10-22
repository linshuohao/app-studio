import { describe, expect, it } from 'vitest';
import { compile, type CompileInput } from '../../src/index.js';
import type { DataReference, InternalConstraint } from '@form-engine/protocol/definition';
import { input } from '../fixtures.js';

const data = (path: string, scope?: string): DataReference => ({
  source: 'data',
  path,
  ...(scope !== undefined ? { scope } : {}),
});
const internal = (id: string, path = '/flag'): InternalConstraint => ({
  id,
  kind: 'internal',
  assert: { ref: data(path) },
  issue: { target: data('/name'), code: id },
});
function source(): CompileInput {
  const value = input();
  value.definition.data.schema = {
    type: 'object',
    properties: {
      name: { type: 'string' },
      flag: { type: 'boolean' },
      people: {
        type: 'array',
        items: {
          type: 'object',
          properties: { flag: { type: 'boolean' }, name: { type: 'string' } },
        },
      },
    },
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
  return result.diagnostics.map((d) => d.code);
}

describe('rule preparation and lexical prerequisite transfer', () => {
  it('expands field prerequisites with Internal ids and conservatively includes the full Schema domain', () => {
    const value = source();
    if (typeof value.definition.data.schema === 'object')
      value.definition.data.schema.dependentRequired = { name: ['flag'] };
    value.definition.constraints = [
      internal('a'),
      {
        id: 'b',
        kind: 'external',
        validator: 'remote',
        watch: [],
        target: data('/name'),
        requires: [{ kind: 'field', target: data('/name'), phase: 'sync' }],
      },
    ];
    const output = prepared(value);
    expect(output.definition.constraints![1]).toMatchObject({
      requires: [{ kind: 'field', target: data('/name'), phase: 'sync', constraintIds: ['a'] }],
      watch: expect.arrayContaining([data(''), data('/flag')]),
    });
  });
  it('keeps purely local field prerequisites precise instead of invalidating on every root change', () => {
    const value = source();
    value.definition.constraints = [
      internal('a'),
      {
        id: 'b',
        kind: 'external',
        validator: 'check',
        watch: [],
        target: data('/name'),
        requires: [{ kind: 'field', target: data('/name'), phase: 'sync' }],
      },
    ];
    expect(prepared(value).definition.constraints![1]!.watch).toEqual([
      data('/flag'),
      data('/name'),
    ]);
  });
  it.each(['missing', 'external', 'self', 'duplicate'] as const)(
    'rejects prerequisite / declaration %s errors',
    (kind) => {
      const value = source();
      const a = internal('a');
      value.definition.constraints = [a];
      if (kind === 'missing') a.requires = [{ kind: 'constraint', constraintId: 'unknown' }];
      if (kind === 'external') {
        a.requires = [{ kind: 'constraint', constraintId: 'remote' }];
        value.definition.constraints.push({
          id: 'remote',
          kind: 'external',
          validator: 'check',
          watch: [],
          target: data('/name'),
        });
      }
      if (kind === 'self') a.requires = [{ kind: 'field', target: data('/name'), phase: 'sync' }];
      if (kind === 'duplicate') value.definition.reactions = [{ id: 'a', watch: [], then: [] }];
      expect(codes(value)).toContain(
        {
          missing: 'PREREQUISITE_NOT_FOUND',
          external: 'PREREQUISITE_EXTERNAL',
          self: 'PREREQUISITE_CYCLE',
          duplicate: 'RULE_ID_DUPLICATE',
        }[kind],
      );
    },
  );
  it('remaps equivalent each aliases while keeping each member watch separate from root paths', () => {
    const value = source();
    const a = internal('a');
    a.scope = { from: data('/people'), as: 'person', mode: 'each' };
    a.assert = { ref: data('/flag', 'person') };
    a.issue.target = data('/name', 'person');
    const b = internal('b');
    b.scope = { from: data('/people'), as: 'member', mode: 'each' };
    b.requires = [{ kind: 'constraint', constraintId: 'a' }];
    value.definition.constraints = [a, b];
    expect(prepared(value).definition.constraints![1]!.watch).toEqual(
      expect.arrayContaining([data('/flag'), data('/flag', 'member')]),
    );
    delete b.scope;
    expect(codes(value)).toContain('PREREQUISITE_SCOPE_AMBIGUOUS');
  });
  it('can translate a static one binder to root without requiring the consumer to duplicate that alias', () => {
    const value = source();
    const a = internal('a');
    a.scope = { from: data(''), as: 'form' };
    a.assert = { ref: data('/flag', 'form') };
    const b = internal('b');
    b.assert = true;
    b.requires = [{ kind: 'constraint', constraintId: 'a' }];
    value.definition.constraints = [a, b];
    expect(prepared(value).definition.constraints![1]!.watch).toEqual([data('/flag')]);
  });
  it('rejects a fixed-index field prerequisite rather than silently omitting an applicable each rule', () => {
    const value = source();
    const a = internal('a');
    a.scope = { from: data('/people'), as: 'person', mode: 'each' };
    a.assert = { ref: data('/flag', 'person') };
    a.issue.target = data('/name', 'person');
    value.definition.constraints = [
      a,
      {
        id: 'b',
        kind: 'external',
        validator: 'check',
        watch: [],
        target: data('/name'),
        requires: [{ kind: 'field', target: data('/people/0/name'), phase: 'sync' }],
      },
    ];
    expect(codes(value)).toContain('PREREQUISITE_SCOPE_AMBIGUOUS');
  });
  it('validates ordered Binder chains and rejects shadowing', () => {
    const value = source();
    const rule = internal('a');
    rule.scope = [
      { from: data('/people'), as: 'person', mode: 'each' },
      { from: data('', 'person'), as: 'current' },
    ];
    rule.assert = { ref: data('/flag', 'current') };
    value.definition.constraints = [rule];
    expect(prepared(value).definition.constraints![0]).toMatchObject({
      scope: [{ mode: 'each' }, { mode: 'one' }],
      watch: [data('/flag', 'current')],
    });
    rule.scope[1]!.as = 'person';
    expect(codes(value)).toContain('SCOPE_SHADOWING');
  });
  it('checks all Command kinds without turning values into triggers or business write restrictions', () => {
    const value = source();
    value.definition.reactions = [
      {
        id: 'edit',
        scope: { from: data('/people'), as: 'person', mode: 'each' },
        watch: [data('/flag')],
        then: [
          {
            op: 'batch',
            commands: [
              { op: 'set', target: data('/name'), value: 42 },
              {
                op: 'patch',
                target: data(''),
                value: { name: { $expr: { ref: data('/name', 'person') } } },
              },
              { op: 'remove', target: data('/name') },
              {
                op: 'array.insert',
                target: data('/people'),
                position: { kind: 'index', index: 0 },
                value: null,
              },
              { op: 'array.remove', target: data('/people'), item: { $scope: 'person' } },
              {
                op: 'array.move',
                target: data('/people'),
                item: { $scope: 'person' },
                position: { kind: 'before', item: { $scope: 'person' } },
              },
            ],
          },
        ],
      },
    ];
    expect(prepared(value).definition.reactions![0]!.watch).toEqual([data('/flag')]);
    value.definition.reactions[0]!.then.push({
      op: 'array.remove',
      target: data('/people'),
      item: { $scope: 'absent' },
    });
    expect(codes(value)).toContain('SCOPE_HANDLE_INVALID');
  });
  it('checks provided Host validator registrations but extracts requirements when no Host contract is supplied', () => {
    const value = source();
    value.definition.constraints = [
      { id: 'remote', kind: 'external', validator: 'check', target: data('/name'), watch: [] },
    ];
    expect(prepared(value).hostRequirements.validators).toEqual([
      { name: 'check', constraintIds: ['remote'] },
    ]);
    value.catalog.host = { validators: {} };
    expect(codes(value)).toContain('HOST_VALIDATOR_NOT_FOUND');
    value.catalog.host.validators!.check = { contractVersion: 'v2' };
    expect(prepared(value).hostRequirements.validators[0]).toMatchObject({ contractVersion: 'v2' });
  });
  it('bounds long named dependency chains instead of overflowing the JS stack', () => {
    const value = source();
    value.definition.expressions = Object.fromEntries(
      Array.from({ length: 150 }, (_, i) => ['e' + i, i < 149 ? { use: 'e' + (i + 1) } : true]),
    );
    expect(codes(value)).toContain('EXPRESSION_BUDGET_EXCEEDED');
  });
});
