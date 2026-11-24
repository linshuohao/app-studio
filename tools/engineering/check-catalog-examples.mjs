// Validate documentation examples against the actual synchronous implementations.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
process.argv.push('--check');
await import('./catalog-docs.mjs');
const functions = await import('../../packages/pure-functions/src/index.ts');
const artifact = { id: 'documentation-check', digest: 'documentation-check' };
const bindings = { ...functions.createCoreFunctions(artifact) };
for (const [name, factory] of Object.entries(functions)) {
  if (name.startsWith('create') && name !== 'createCoreFunctions') {
    const binding = factory(artifact);
    bindings[binding.manifest.id] = binding;
  }
}
const docs = JSON.parse(
  readFileSync(new URL('../../packages/pure-functions/catalog-docs.json', import.meta.url), 'utf8'),
);
const controls = new Set(['core.and', 'core.or', 'core.if', 'core.exists']);
let checked = 0;
for (const [id, doc] of Object.entries(docs)) {
  for (const example of doc.callExamples) {
    if (controls.has(id)) continue; // Runtime control forms are not ordinary invoke implementations.
    assert.deepEqual(bindings[id].invoke(example.args), example.result, id);
    checked++;
  }
}
console.log(
  `${checked} function examples match implementations; 4 Runtime control examples require expression context.`,
);

const { createRequire } = await import('node:module');
const require = createRequire(new URL('../../packages/compiler/package.json', import.meta.url));
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, allErrors: true });
const materialDocs = JSON.parse(
  readFileSync(
    new URL('../../packages/materials-react/catalog-docs.json', import.meta.url),
    'utf8',
  ),
);
for (const [id, doc] of Object.entries(materialDocs)) {
  const { manifest } = await import(`../../packages/materials-react/src/${id}/manifest.ts`);
  const props = doc.valueExamples.find((example) => example.title === 'Props 示例').value;
  assert.equal(ajv.validate(manifest.propsSchema, props), true, `${id}: ${ajv.errorsText()}`);
  const values = doc.valueExamples.find((example) => example.title === '绑定值示例')?.value;
  for (const [name, binding] of Object.entries(manifest.bindings ?? {}))
    assert.equal(
      ajv.validate(binding.schema, values[name]),
      true,
      `${id}.${name}: ${ajv.errorsText()}`,
    );
}
console.log(
  `${Object.keys(materialDocs).length} material property/binding examples conform to their manifests.`,
);

for (const [id, doc] of Object.entries(docs)) {
  const { manifest } = bindings[id];
  for (const example of doc.callExamples) {
    example.args.forEach((value, index) => {
      const parameter = manifest.parameters[index] ?? manifest.restParameter;
      assert.ok(parameter, `${id}: unexpected argument ${index}`);
      assert.equal(
        ajv.validate(parameter.schema, value),
        true,
        `${id} argument ${index}: ${ajv.errorsText()}`,
      );
    });
    assert.equal(
      ajv.validate(manifest.returns, example.result),
      true,
      `${id} result: ${ajv.errorsText()}`,
    );
  }
}
const remote = await import('../../packages/materials-react/src/remote-select/manifest.ts');
const searchExamples = materialDocs['remote-select'].requestExamples.search;
for (const [index, schema] of [
  remote.manifest.requests.search.payloadSchema,
  remote.manifest.requests.search.resultSchema,
  remote.manifest.bindings.value.schema,
].entries()) {
  assert.equal(
    ajv.validate(schema, searchExamples[index].value),
    true,
    `search example ${index}: ${ajv.errorsText()}`,
  );
}
console.log(
  '23 function input/output examples and remote search examples conform to their schemas.',
);
