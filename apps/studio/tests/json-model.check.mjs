import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
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
const { parseJson, editNode, removeNode, addNode, valueToken } =
  await import('../src/components/json/model.ts');
const raw = '{"\\u0061":9007199254740993,"a":-0,"s":"\\u0041\\/","arr":[true,null,{}]}';
let { tokens, root } = parseJson(raw);
assert.equal(
  editNode(tokens, root.children[0], '9007199254740994', 'a'),
  raw.replace('9007199254740993', '9007199254740994'),
);
assert.equal(editNode(tokens, root.children[1], '1'), raw.replace('"a":-0', '"a":1'));
assert.equal(
  removeNode(tokens, root, root.children[0]),
  '{"a":-0,"s":"\\u0041\\/","arr":[true,null,{}]}',
);
assert.throws(() => addNode(tokens, root, '1', 'a'), /同名/);
assert.equal(JSON.parse(addNode(tokens, root, '1', '__proto__')).__proto__, 1);
for (let index = 0; index < 3; index++) {
  const { tokens, root } = parseJson('[1,2,3]');
  assert.deepEqual(
    JSON.parse(removeNode(tokens, root, root.children[index])),
    [1, 2, 3].filter((_, i) => i !== index),
  );
}
({ tokens, root } = parseJson('{"one":[]}'));
assert.equal(addNode(tokens, root.children[0], '"x"', ''), '{"one":["x"]}');
assert.equal(valueToken('number', '9007199254740993'), '9007199254740993');
assert.equal(valueToken('number', '-0'), '-0');
assert.throws(() => valueToken('number', '01'));
assert.throws(() => parseJson('{"a":'));
assert.throws(() => parseJson('['.repeat(130) + '0' + ']'.repeat(130)), RangeError);
console.log(
  'JSON node edits, duplicate keys, exact number/escape preservation, removals, insertion and limits passed',
);

assert.equal(
  valueToken('object', ' { "x": 9007199254740993, "x": -0 } '),
  '{"x":9007199254740993,"x":-0}',
);
assert.throws(() => valueToken('object', '[]'));
assert.throws(() => valueToken('array', '{}'));
assert.throws(() => valueToken('object', '{"x":'));
assert.equal(valueToken('array', ' [ true, null ] '), '[true,null]');
