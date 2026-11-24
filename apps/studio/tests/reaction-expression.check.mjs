import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { createCoreFunctions } from '@form-engine/pure-functions';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.json'))
      return { ...next(specifier, context), importAttributes: { type: 'json' } };
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && !specifier.endsWith('.ts'))
        return next(specifier + '.ts', context);
      if (specifier === 'ajv/dist/2020') return next(specifier + '.js', context);
      throw error;
    }
  },
});

const { checkReactionExpression, checkReactionValue, expressionLiteral, valueAsExpression } =
  await import('../src/app/reaction-expression-model.ts');
const { reactionFields } = await import('../src/app/reaction-fields.ts');
const manifest = {
  id: 'test.optional',
  version: '1',
  parameters: [
    { name: 'first', schema: { type: 'integer' } },
    { name: 'second', schema: { type: 'string' }, optional: true },
  ],
  restParameter: { name: 'extras', schema: { type: 'boolean' } },
  returns: { type: 'number' },
};
const manifests = [
  ...Object.values(
    createCoreFunctions({ id: 'fixture', platform: 'web', digest: 'sha256:' + '0'.repeat(64) }),
  ).map((f) => f.manifest),
  manifest,
];
const ref = (path, scope) => ({ source: 'data', path, ...(scope === undefined ? {} : { scope }) });
const schema = {
  type: 'object',
  properties: {
    age: { type: 'string' },
    persons: { type: 'array', items: { type: 'object', properties: { age: { type: 'integer' } } } },
  },
};
const fields = reactionFields(schema, { as: 'member42', mode: 'each', from: ref('/persons') });
const context = { fields, manifests };
const bool = { type: 'boolean' };
const check = (e, expected = true, extra = {}) =>
  checkReactionExpression(JSON.stringify(e), { ...context, expected, ...extra });
const call = (op, ...args) => ({ op, args });

test('calls honor optional tail and rest argument positions independently of argument count', () => {
  for (const args of [[3], [3, 'x'], [3, 'x', true, false]])
    assert.equal(check(call(manifest.id, ...args)), undefined);
  for (const args of [[], ['bad'], [3, false], [3, 'x', false, 1]])
    assert.throws(() => check(call(manifest.id, ...args)));
  assert.throws(() => check(call('core.not', true, false)), /参数数量/);
  assert.throws(() => check(call('no.such.function')), /目录/);
  assert.throws(() => check(call('core.not', call(manifest.id, 3))), /boolean/);
});
test('typed root and member references resolve the same pointer separately and distinguish validation projections', () => {
  const member = ref('/age', 'member42'),
    root = ref('/age');
  assert.equal(check(call('core.gt', { ref: member }, 0), bool), undefined);
  assert.throws(() => check(call('core.gt', { ref: root }, 0), bool), /number/);
  const projected = (observe) => ({ ref: { source: 'validation', field: member, observe } });
  assert.equal(check(call('core.length', projected('issues'))), undefined);
  assert.equal(check(call('core.length', projected('status'))), undefined);
  assert.throws(() => check(call('core.length', projected('state'))), /object/);
  assert.throws(() => check({ ref: { source: 'event', path: '' } }), /事件上下文/);
});
test('named expressions use root scope, preserve returns, and reject invalid cycles or missing definitions', () => {
  const named = {
    n: 3,
    pred: call('core.gt', 1, 0),
    alias: { use: 'pred' },
    cycle: { use: 'cycle' },
    captures: { ref: ref('/age', 'member42') },
  };
  assert.equal(check({ use: 'alias' }, bool, { named }), undefined);
  for (const use of ['n', 'cycle', 'captures', 'missing'])
    assert.throws(() => check({ use }, bool, { named }));
  assert.throws(() => check({ use: 'n' }, false, { named }));
});
test('expression and ValueSpec literals remain opaque while nested executable expressions are checked', () => {
  const lookalike = '{"op":"not-a-function","args":[9007199254740993],"ref":{"path":"/age"}}';
  assert.equal(expressionLiteral(lookalike), '{"literal":' + lookalike + '}');
  assert.equal(checkReactionExpression(expressionLiteral(lookalike), context), undefined);
  assert.equal(checkReactionValue('{"$literal":{"$expr":' + lookalike + '}}', context), undefined);
  assert.throws(
    () => checkReactionValue('{"x":[{"$expr":{"op":"core.not","args":[3]}}]}', context),
    /常量/,
  );
  for (const invalid of [
    '{"op":"core.not","args":true}',
    '{"op":"core.not","args":[],"extra":2}',
    '{"literal":1,"literal":2}',
  ])
    assert.throws(() => checkReactionExpression(invalid, context));
  assert.throws(() => checkReactionValue('{"$expr":false,"sibling":true}', context));
});
test('write-target types give advice, while invalid function arguments still fail inside a write', () => {
  const opts = { ...context, expected: { type: 'integer', minimum: 10 }, advisory: true };
  assert.equal(checkReactionValue('3', opts), undefined);
  assert.match(checkReactionValue('"3"', opts), /integer/);
  assert.match(
    checkReactionValue('{"$expr":{"ref":{"source":"data","path":"/age"}}}', opts),
    /integer/,
  );
  assert.throws(() => checkReactionValue('{"$expr":{"op":"core.gt","args":[true,0]}}', opts));
});

test('switching to a single expression preserves top-level literals and leaves composite wrappers in ValueSpec', () => {
  assert.equal(
    valueAsExpression('{"$literal":{"$expr":9007199254740993}}'),
    '{"literal":{"$expr":9007199254740993}}',
  );
  assert.equal(valueAsExpression('{"$expr":{"literal":2e1}}'), '{"literal":2e1}');
  assert.equal(valueAsExpression('[1e2]'), '{"literal":[1e2]}');
  assert.throws(() => valueAsExpression('{"total":{"$literal":{"$expr":3}}}'), /嵌套/);
  assert.throws(() => valueAsExpression('[{"$expr":true}]'), /嵌套/);
});
