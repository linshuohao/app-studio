import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts'))
        return next(specifier + '.ts', context);
      throw error;
    }
  },
});
const { reactionFields, reactionReads, removedScopeInUse, watchIdentity, watchSchema } =
  await import('../src/app/reaction-fields.ts');
const data = (path, scope) => ({ source: 'data', path, ...(scope !== undefined && { scope }) });
const status = (field, observe = 'status') => ({ source: 'validation', field, observe });
const each = (from, as) => ({ from, mode: 'each', as });
const person = data('/age', 'covered'),
  root = data('/age');
const scope = [each(data('/plans'), 'plan'), each(data('/people', 'plan'), 'covered')];
const schema = {
  type: 'object',
  properties: {
    age: { type: 'string' },
    plans: {
      type: 'array',
      items: {
        type: 'object',
        properties: { people: { type: 'array', items: { $ref: '#/$defs/person' } } },
      },
    },
  },
  $defs: {
    person: {
      type: 'object',
      properties: {
        age: { type: 'integer' },
        '~/': { type: 'boolean' },
        relative: { $ref: '#/$defs/person' },
      },
    },
  },
};

test('ordered alias projection resolves items, root, recursive definitions and pointer escaping', () => {
  const fields = reactionFields(schema, scope);
  assert.deepEqual(watchSchema(fields, root), { type: 'string' });
  assert.deepEqual(watchSchema(fields, person), { type: 'integer' });
  assert.deepEqual(watchSchema(fields, data('/~0~1', 'covered')), { type: 'boolean' });
  assert.ok(!fields.some((f) => f.ref.path.includes('people/age')));
  assert.ok(fields.length < 20);
  assert.equal(watchSchema(fields, data('/age', 'plan')), undefined);
  assert.equal(watchSchema(fields, status(person, 'issues')).type, 'array');
  assert.ok(!reactionFields(schema, [...scope].reverse()).some((f) => f.ref.scope === 'covered'));
});

test('a reference with sibling assertions exposes no unproven child shape', () => {
  const composite = {
    ...schema,
    properties: {
      part: {
        $ref: '#/$defs/person',
        type: 'object',
        properties: { invented: { type: 'boolean' } },
      },
    },
  };
  const fields = reactionFields(composite);
  assert.ok(!fields.some((f) => f.ref.path === '/part/invented'));
});

test('reads distinguish source, alias and projection and skip targets and literal payloads', () => {
  const named = { readRoot: { ref: root } };
  const expr = {
    op: 'test',
    args: [
      { ref: person },
      { ref: status(person) },
      { ref: status(person, 'state') },
      { use: 'readRoot' },
      { literal: { ref: data('/ignore') } },
    ],
  };
  const action = {
    op: 'batch',
    commands: [
      { op: 'set', target: data('/target'), value: { $expr: expr } },
      {
        op: 'patch',
        target: data(''),
        value: { $expr: { $literal: { $expr: { ref: data('/ignore') } } } },
      },
    ],
  };
  const reads = reactionReads(action, 'action', named);
  assert.deepEqual(reads, [person, status(person), status(person, 'state'), root]);
  assert.equal(new Set(reads.map(watchIdentity)).size, 4);
});

test('scope removal detects surviving handles, write targets, watch, reads, or downstream binders', () => {
  for (const rule of [
    { then: [{ op: 'set', target: person, value: 0 }] },
    { watch: [status(person)] },
    { when: { ref: person } },
    { then: [{ type: 'host.emit', event: 'test', payload: { item: { $expr: { ref: person } } } }] },
    {
      then: [
        {
          op: 'array.move',
          item: { $scope: 'elsewhere' },
          position: { kind: 'after', item: { $scope: 'covered' } },
        },
      ],
    },
  ])
    assert.equal(removedScopeInUse(scope, scope[0], rule), 'covered');
  assert.equal(removedScopeInUse(scope, scope[1], {}), 'plan');
  assert.equal(
    removedScopeInUse(scope, undefined, {
      then: [{ op: 'set', target: root, value: { $literal: { ref: person, $scope: 'covered' } } }],
    }),
    undefined,
  );
});
