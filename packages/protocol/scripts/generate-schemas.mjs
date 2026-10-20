import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createGenerator } from 'ts-json-schema-generator';
import { toDraft2020 } from './schema-dialect.mjs';
import Ajv2020 from 'ajv/dist/2020.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const checking = process.argv.includes('--check');
const groups = {
  definition: {
    FormDefinition: 'form-definition',
    AuthoringFormDefinition: 'authoring-form-definition',
    Command: 'command',
    Expression: 'expression',
    ValueSpec: 'value-spec',
  },
  capability: {
    MaterialManifest: 'material-manifest',
    PureFunctionManifest: 'pure-function-manifest',
    HostContract: 'host-contract',
    CapabilityCatalogSnapshot: 'capability-catalog-snapshot',
  },
  prepared: { PreparedForm: 'prepared-form' },
};
// One TS program per domain, then several JSON entry documents. Files never depend on wall-clock time.
const generated = new Map();
for (const [domain, entries] of Object.entries(groups)) {
  const generator = createGenerator({
    path: resolve(root, `src/${domain}/index.ts`),
    tsconfig: resolve(root, 'tsconfig.json'),
    expose: 'export',
    jsDoc: 'extended',
    extraTags: ['propertyNames'],
    additionalProperties: false,
    strictTuples: true,
    functions: 'fail',
    skipTypeCheck: false,
  });
  for (const [type, name] of Object.entries(entries)) {
    const schema = toDraft2020(generator.createSchema(type));
    schema.$id = `https://form-engine.invalid/schemas/${name}.schema.json`;
    // TS models embedded Schema as JSON. Its actual grammar is the standard 2020-12 meta-schema,
    // not a second hand-maintained collection of keyword types or a custom Ajv keyword.
    if (schema.$defs?.JsonSchema) {
      schema.$defs.JsonSchema = { $ref: 'https://json-schema.org/draft/2020-12/schema' };
    }
    // The generator must carry the source annotation at the ordinary object branch.
    for (const key of ['ValueObject', 'PreparedValueObject']) {
      if (schema.$defs?.[key]) {
        assert.deepEqual(schema.$defs[key].propertyNames, { not: { enum: ['$expr', '$literal'] } });
      }
    }
    generated.set(`${name}.schema.json`, `${JSON.stringify(sort(schema), null, 2)}\n`);
  }
}
function sort(value) {
  if (Array.isArray(value)) return value.map(sort);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sort(value[key])]),
    );
  }
  return value;
}
// Compile every published root with strict, non-mutating validation before writing/checking outputs.
const ajv = new Ajv2020({
  strict: true,
  allowUnionTypes: true,
  strictRequired: false,
  allErrors: true,
  validateFormats: false,
});
for (const contents of generated.values()) ajv.addSchema(JSON.parse(contents));
for (const contents of generated.values()) ajv.getSchema(JSON.parse(contents).$id);
const output = resolve(root, 'schemas');
await mkdir(output, { recursive: true });
const existing = (await readdir(output)).filter((file) => file.endsWith('.schema.json'));
assert(
  existing.every((file) => generated.has(file)),
  'Unexpected obsolete schema; remove deliberately',
);
for (const [file, contents] of generated) {
  const path = resolve(output, file);
  if (checking)
    assert.equal(await readFile(path, 'utf8'), contents, `Stale generated schema: ${file}`);
  else await writeFile(path, contents);
}
console.log(
  `${checking ? 'Checked' : 'Generated'} ${generated.size} strict JSON Schema 2020-12 roots`,
);
