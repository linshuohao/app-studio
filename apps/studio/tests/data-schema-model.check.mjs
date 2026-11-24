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
const { dataSchemaModel: model } = await import('../src/app/data-schema-model.ts');
const base = '/data/schema';
const wrap = (schema) =>
  '{"outside": {"x": 9007199254740993, "x": -0, "s":"\\u0041"}, "data":{"schema":' + schema + '}}';
const source = wrap(
  '{"type":"object","properties":{"people":{"type":"array","items":{"type":"object"}}}}',
);
const item = base + '/properties/people/items';
const field = item + '/properties/a~1b~0';
let next = model(source).addField(item, 'a/b~', '{"type":"integer"}');
next = model(next).set(field, 'minimum', '-1.00');
next = model(next).setRequired(field, true);
assert.equal(model(next).nodes.find((n) => n.node.path === field).required, true);
const before = next;
next = model(next).renameNamed(field, 'other');
assert.deepEqual(JSON.parse(next).data.schema.properties.people.items.required, ['other']);
assert.equal(model(next).deleteNamed(item + '/properties/other'), source);
assert.equal(model(before).deleteNamed(field), source);
assert.ok(before.includes('9007199254740993, "x": -0, "s":"\\u0041"'));
const ordered = wrap('{"properties":{"first":{"minimum":1.00} , "last":{}}}');
const first = base + '/properties/first';
const inserted = model(ordered).insertSibling(first, 'a/b~', '{"type":"string"}');
assert.equal(inserted, ordered.replace(' , "last"', ' ,"a/b~":{"type":"string"}, "last"'));
assert.throws(() => model(ordered).insertSibling(first, 'last', '{}'), /同名/);
const dup = model(wrap('{"properties":{"a":{},"a":{},"b":{"minimum":1,"minimum":2}}}'));
assert.throws(() => dup.set(base + '/properties/a', 'x', 'true'), /重复/);
assert.throws(() => dup.remove(base + '/properties/b/minimum'), /重复/);
const refs = model(
  wrap(
    '{"properties":{"contact":{"$ref":"#/$defs/Person"},"people":{"items":{"$ref":"#/$defs/Alias"}}},"$defs":{"Person":{"properties":{"name":{"type":"string"}}},"Alias":{"$ref":"#/$defs/Person"}}}',
  ),
);
const uses = refs.impacts(base + '/$defs/Person/properties/name');
assert.deepEqual(uses.paths.sort(), [
  base + '/$defs/Alias',
  base + '/properties/contact',
  base + '/properties/people/items',
]);
assert.equal(uses.unknown, false);
assert.throws(() => refs.deleteNamed(base + '/$defs/Person'), /引用|使用/);
assert.equal(
  model(wrap('{"$defs":{"X":{}},"$dynamicRef":"#X"}')).impacts(base + '/$defs/X').unknown,
  true,
);
const risky = model(wrap('{"properties":{"a":{}},"if":{"properties":{"a":{"const":"old"}}}}'));
assert.throws(() => risky.renameNamed(base + '/properties/a', 'b'), /使用|引用/);
assert.throws(() => refs.set('/outside', 'x', '2'), /模型/);
assert.deepEqual(JSON.parse(model('{"data":{"meta":1}}').createSchema()), {
  data: { meta: 1, schema: { type: 'object' } },
});
assert.deepEqual(JSON.parse(model('{}').createSchema()), { data: { schema: { type: 'object' } } });
for (const raw of ['[]', '{"data":[]}', '{"data":{},"data":{}}', source])
  assert.throws(() => model(raw).createSchema());
const ancestorRule = model(
  wrap(
    '{"properties":{"group":{"properties":{"city":{}}}},"if":{"properties":{"group":{"required":["city"]}}}}',
  ),
);
assert.throws(() => ancestorRule.deleteNamed(base + '/properties/group/properties/city'), /使用/);
const arrayUse = model(
  source.replace(
    '"outside"',
    '"views":{"entry":{"bindings":{"value":{"source":"data","path":"/people/0/age"}}}},"outside"',
  ),
);
assert.throws(() => arrayUse.deleteNamed(item), /使用/);
assert.ok(!model(source).deleteNamed(item).includes('"items"'));

const destination = model(wrap('{"properties":{"old":{}},"if":{"required":["future"]}}'));
assert.throws(() => destination.renameNamed(base + '/properties/old', 'future'), /使用/);
const override = model(
  source.replace(
    '"outside"',
    '"validationMessages":[{"schemaRef":"#/properties/people/items","keyword":"type"}],"outside"',
  ),
);
assert.throws(() => override.deleteNamed(item), /使用/);
const inherited = model(
  wrap(
    '{"properties":{"age":{}},"allOf":[{"$ref":"#/$defs/Check"}],"$defs":{"Check":{"required":["age"]}}}',
  ),
);
assert.throws(() => inherited.deleteNamed(base + '/properties/age'), /使用/);
assert.throws(() => model(source).addField(item, 'name', '{}, "extra":true'));
const templates = (params) =>
  model(
    '{"data":{"schema":{"$defs":{"Person":{"properties":{"age":{}}},"List":{"items":{"$ref":"#/$defs/Person"}}}}},"viewTemplates":{"travel":{"params":' +
      params +
      '}}}',
  );
const template = templates(
  '{"guest":{"schemaRef":"#/$defs/Person"},"roster":{"schemaRef":"#/$defs/List"}}',
);
const person = base + '/$defs/Person';
assert.deepEqual(template.impacts(person + '/properties/age').paths.sort(), [
  base + '/$defs/List/items',
  '/viewTemplates/travel/params/guest/schemaRef',
  '/viewTemplates/travel/params/roster/schemaRef',
]);
assert.throws(() => template.deleteNamed(person), /引用|使用/);
assert.throws(() => template.renameNamed(person, 'Guest'), /引用|使用/);
const onlyTemplate = model(
  '{"data":{"schema":{"properties":{"x":{}}}},"viewTemplates":{"t":{"params":{"p":{"schemaRef":"#/properties/x"}}}}}',
);
assert.deepEqual(onlyTemplate.impacts(base + '/properties/x'), {
  paths: ['/viewTemplates/t/params/p/schemaRef'],
  unknown: false,
});
assert.throws(() => onlyTemplate.deleteNamed(base + '/properties/x'), /引用|使用/);
const ambiguousTemplate = templates(
  '{"guest":{"schemaRef":"#/$defs/List","schemaRef":"#/$defs/Person"}}',
);
assert.equal(ambiguousTemplate.impacts(person).unknown, true);
assert.throws(() => ambiguousTemplate.renameNamed(person, 'Guest'), /引用|使用/);
const tupleFixture = (extra) =>
  model('{"data":{"schema":{"prefixItems":[{},{"minimum":3}],"allOf":[{},{}]}},' + extra + '}');
const tuple = tupleFixture(
  '"validationMessages":[{"schemaRef":"#/prefixItems/1","keyword":"minimum"}]',
);
for (const p of ['/prefixItems', '/prefixItems/0', '/prefixItems/1', '/prefixItems/1/minimum'])
  assert.throws(() => tuple.remove(base + p), /引用|使用/);
const composition = tupleFixture(
  '"viewTemplates":{"t":{"params":{"v":{"schemaRef":"#/allOf/1"}}}}',
);
assert.throws(() => composition.remove(base + '/allOf/0'), /引用|使用/);
assert.doesNotThrow(() => composition.remove(base + '/prefixItems/0'));
const literalFixtures = model(
  source.replace(
    '"outside"',
    '"views":{"entry":{"props":{"sample":{"$literal":{"source":"data","source":"data","path":"/people"}},"raw":{"source":"data","path":"/people"}}}},"expressions":{"constant":{"literal":{"source":"data","path":"/people"}}},"outside"',
  ),
);
assert.doesNotThrow(() => literalFixtures.deleteNamed(item));
const namedLiteral = model(
  source.replace(
    '"outside"',
    '"views":{"literal":{"bindings":{"literal":{"source":"data","path":"/people"}}}},"outside"',
  ),
);
assert.throws(() => namedLiteral.deleteNamed(item), /引用|使用/);
const localTuple = model(wrap('{"allOf":[{},{}],"properties":{"p":{"$ref":"#/allOf/1"}}}'));
assert.throws(() => localTuple.remove(base + '/allOf/0'), /引用|使用/);
const shortBind = model(
  source.replace(
    '"outside"',
    '"views":{"entry":{"children":[{"material":"text-input","bind":"/people/0/age"}]}},"outside"',
  ),
);
assert.deepEqual(shortBind.impacts(item).paths, ['/views/entry/children/0/bind']);
assert.throws(() => shortBind.deleteNamed(item), /使用/);
assert.throws(() => tuple.replace(base, 'true'), /引用|使用/);
assert.throws(
  () => localTuple.replace(base, '{"$defs":{"a":{}},"properties":{"p":{"$ref":"#/allOf/1"}}}'),
  /引用|使用/,
);
const retainedLocal = model(
  wrap(
    '{"allOf":[{"properties":{"n":{"type":"number"}}}],"properties":{"p":{"$ref":"#/allOf/0/properties/n"}}}',
  ),
);
assert.throws(() => retainedLocal.replace(base + '/allOf/0', 'false'), /引用|使用/);
assert.doesNotThrow(() => retainedLocal.set(base + '/allOf/0/properties/n', 'minimum', '0'));
const unlocated = model(wrap('{"$ref":"external.json","if":{"type":"string"}}'));
assert.throws(() => unlocated.replace(base + '/if', 'false'), /引用|使用/);
console.log(
  'Schema source editing, atomic required updates, escaped names, ambiguity, use sites and deletion guards passed',
);
