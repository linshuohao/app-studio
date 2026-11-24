import assert from 'node:assert/strict';
import {
  compactJson,
  displayJson,
  storageJson,
  formatJson,
} from '../src/components/json/format.ts';
const raw = '{"x":9007199254740993,"x":-0,"text":"a b\\n\\u0041","items":[true,null,{}]}';
assert.equal(compactJson(formatJson(raw)), raw);
assert.ok(displayJson(raw).includes('\n'));
assert.equal(storageJson(' {"invalid": '), ' {"invalid": ');
const near = '{"items":[' + Array(700).fill('{"x":1}').join(',') + ']}';
assert.ok(formatJson(near).length > 16384);
assert.equal(storageJson(formatJson(near)), near);
assert.ok(formatJson('{"x":"' + 'x'.repeat(17000) + '"}').includes('\n'));
assert.equal(
  formatJson('{"obj":{"arr":[1,true]}}'),
  JSON.stringify({ obj: { arr: [1, true] } }, null, 4) + '\n',
);
console.log(
  'JSON precision, duplicate keys, escapes, invalid text and expanded >16KiB checks passed',
);
