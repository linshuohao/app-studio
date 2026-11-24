// Local acceptance through the same authenticated Platform route used by Studio.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const base = new URL(process.env.CREATE_FORM_ACCEPTANCE_URL ?? 'http://127.0.0.1:3001');
assert(['127.0.0.1', 'localhost'].includes(base.hostname), 'Local development login only');
const headers = {
  origin: process.env.PLATFORM_STUDIO_ORIGIN ?? 'http://127.0.0.1:3200',
  'content-type': 'application/json',
};
const login = await fetch(new URL('/api/platform/local-login', base), { method: 'POST', headers });
assert.equal(login.status, 200, 'Enable local development login on the acceptance instance');
headers.cookie = login.headers
  .getSetCookie()
  .map((x) => x.split(';')[0])
  .join('; ');
const requirements_document = {
  document_id: 'travel-city',
  version: '1',
  markdown:
    '旅险表单：国家可选中国（CN）或日本（JP）。按所选国家搜索城市，列表显示城市名称。城市提交值是只存编码还是保存整个选项，需要产品确认。更换国家后清空原城市。城市搜索能力的输入和返回签名待从目标目录核对。',
};
const id = randomUUID();
let revision = 0;
async function turn(message, document) {
  const res = await fetch(new URL('/api/platform/agent-conversations/' + id + '/turns', base), {
    method: 'POST',
    headers,
    body: JSON.stringify({ message, document, turnId: randomUUID(), revision }),
  });
  assert.equal(res.status, 201);
  const view = await res.json();
  const result = view.conversation.turns[revision].result;
  revision = view.conversation.revision;
  console.log('Agent turn', revision, result.kind);
  return { result, draft: view.draft };
}
const first = await turn('请按文档创建旅险表单', requirements_document.markdown);
assert.equal(first.result.kind, 'clarification');
const second = await turn('城市只存编码');
assert.equal(second.result.kind, 'proposal');
assert(second.draft);
assert.equal(
  second.draft.candidateDigest,
  'sha256:' + createHash('sha256').update(second.draft.candidateText).digest('hex'),
);
if (process.env.CREATE_FORM_ACCEPTANCE_OUTPUT)
  await writeFile(
    process.env.CREATE_FORM_ACCEPTANCE_OUTPUT,
    JSON.stringify({ first, second }, null, 2),
  );
console.log('Verified independent draft', second.draft.id, second.draft.candidateDigest);
