// Opt-in live acceptance. Run against an isolated Studio/API with local login enabled.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { clickTurn as submit } from './assistant-browser.mjs';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const origin = new URL(process.env.CREATE_FORM_STUDIO_URL ?? 'http://127.0.0.1:3200');
assert(['localhost', '127.0.0.1'].includes(origin.hostname));
const browser = await chromium.launch({
  channel: process.env.STUDIO_TEST_BROWSER_CHANNEL || 'chrome',
});
try {
  const page = await browser.newPage({ baseURL: origin.origin });
  page.on('pageerror', (e) => console.error('Studio error:', e.message));
  page.setDefaultTimeout(30000);
  const responses = (suffix) =>
    page
      .waitForResponse(
        (r) =>
          r.url().includes('/form-drafts/') &&
          !r.url().includes('/editor/') &&
          r.url().endsWith(suffix) &&
          r.request().method() === 'POST',
        { timeout: 620000 },
      )
      .then(async (r) => {
        const data = r.headers()['content-type']?.includes('application/x-ndjson')
          ? JSON.parse((await r.text()).trimEnd().split('\n').at(-1)).result
          : await r.json();
        assert(r.ok(), JSON.stringify(data));
        return data;
      });
  async function clickTurn(label) {
    return submit(page, label);
  }
  await page.goto('/');
  await page.getByRole('button', { name: '以本地开发账号登录' }).click();
  await page.getByRole('button', { name: '表单助手', exact: true }).click();
  await page
    .getByLabel('发送消息')
    .fill(
      '旅险表单：国家可选中国（CN）或日本（JP）。按所选国家搜索城市，列表显示城市名称。城市提交值是只存编码还是保存整个选项，需要产品确认。更换国家后清空原城市。城市搜索能力的输入和返回签名待从目标目录核对。',
    );
  const started = performance.now();
  const first = await clickTurn('发送');
  const clarified = performance.now();
  assert.equal(first.conversation.turns.at(-1).result.kind, 'clarification');
  const requests = [];
  const record = (r) => requests.push(r.method() + ' ' + new URL(r.url()).pathname);
  page.on('request', record);
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('button', { name: '助手会话' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: first.conversation.title })
    .getByRole('button', { name: '继续对话' })
    .click();
  await expect(
    page.getByText(first.conversation.turns.at(-1).result.questions[0], { exact: false }).first(),
  ).toBeVisible();
  page.off('request', record);
  assert(!requests.some((r) => r.endsWith('/turns')));
  const resumed = performance.now();
  await page.getByLabel('发送消息').fill('城市只存编码');
  const second = await clickTurn('发送');
  assert.equal(second.conversation.id, first.conversation.id);
  console.log(
    'resume measurement',
    JSON.stringify({
      id: first.conversation.id,
      firstMs: clarified - started,
      resumeMs: resumed - clarified,
      secondMs: performance.now() - resumed,
      requests,
      result: second.conversation.turns.at(-1).result.kind,
    }),
  );
  const secondMs = performance.now() - resumed;
  const original = second.conversation.turns.at(-1).result;
  assert.equal(original.kind, 'proposal', original.reason ?? original.message);
  if (process.env.CREATE_FORM_TRIAL_ONLY && process.env.CREATE_FORM_ACCEPTANCE_OUTPUT)
    await writeFile(
      process.env.CREATE_FORM_ACCEPTANCE_OUTPUT,
      JSON.stringify(
        {
          session: second.conversation.id,
          firstMs: clarified - started,
          resumeMs: resumed - clarified,
          secondMs,
          candidate: original,
          trial: 'pending',
        },
        null,
        2,
      ),
    );
  if (process.env.CREATE_FORM_RESUME_ONLY) {
    await browser.close();
    process.exit(0);
  }
  await expect(page.getByLabel('版本名称')).toHaveValue('Agent 初稿 V1');
  await page.getByLabel('版本名称').fill('旅险验收初稿');
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('button', { name: '表单助手', exact: true }).click();
  await expect(page.getByLabel('发送消息')).toHaveValue('');
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('button', { name: '助手会话' }).click();
  await page
    .getByRole('listitem')
    .filter({ hasText: second.conversation.title })
    .getByRole('button', { name: '继续对话' })
    .click();
  await expect(page.getByLabel('版本名称')).toHaveValue('旅险验收初稿');
  async function preview() {
    const [p] = await Promise.all([
      responses('/preview'),
      page.getByRole('button', { name: '预览试填' }).click(),
    ]);
    return p;
  }
  async function fill() {
    const area = page.getByRole('region', { name: '候选预览' });
    const country = area.getByRole('combobox');
    async function selectCountry(name) {
      const option = country.getByRole('option', { name });
      await country.selectOption(await option.getAttribute('value'));
    }
    await selectCountry(/中国/);
    await area.getByRole('searchbox').fill('上海');
    await area.getByRole('button', { name: '搜索', exact: true }).click();
    await area.getByRole('button', { name: '上海市（模拟）' }).click();
    await expect(area.getByText('当前选择：上海市（模拟）')).toBeVisible();
    await selectCountry(/日本/);
    await expect(area.getByText('当前选择：未选择')).toBeVisible();
    await area.getByRole('searchbox').fill('东京');
    await area.getByRole('button', { name: '搜索', exact: true }).click();
    await area.getByRole('button', { name: '东京市（模拟）' }).click();
    await expect(area.getByText('当前选择：东京市（模拟）')).toBeVisible();
  }
  assert.equal((await preview()).digest, second.draft.candidateDigest);
  await fill();
  await page.getByRole('button', { name: '确认此版试填结果' }).click();
  if (process.env.CREATE_FORM_TRIAL_ONLY) {
    if (process.env.CREATE_FORM_ACCEPTANCE_OUTPUT)
      await writeFile(
        process.env.CREATE_FORM_ACCEPTANCE_OUTPUT,
        JSON.stringify(
          {
            session: second.conversation.id,
            firstMs: clarified - started,
            resumeMs: resumed - clarified,
            secondMs,
            candidate: original,
            trial: '上海 → 更换国家清空 → 东京',
          },
          null,
          2,
        ),
      );
    await browser.close();
    process.exit(0);
  }
  await page
    .getByLabel('发送消息')
    .fill(
      '请在刚才试填的原候选上，把城市搜索框的 placeholder 改为“搜索目的地城市”，保留原业务规则。',
    );
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await page.getByRole('button', { name: '文本查看 / 修复' }).click();
  const raw = page.getByRole('textbox', { name: '配置原文' });
  const working = JSON.parse(await raw.inputValue());
  function cityNode(value) {
    if (!value || typeof value !== 'object') return;
    if (value.material === 'remote-select') return value;
    return Object.values(value).map(cityNode).find(Boolean);
  }
  const remote = cityNode(working.views);
  assert(remote);
  (remote.props ??= {}).placeholder = '请输入抵达城市';
  working.data.schema.description = '旅险工作稿手工说明';
  const revisedPromise = clickTurn('发送');
  await page.waitForRequest((r) => r.url().endsWith('/turns') && r.method() === 'POST');
  await raw.fill(JSON.stringify(working));
  const revised = await revisedPromise;
  const latest = revised.conversation.turns.at(-1).result;
  assert.equal(latest.kind, 'proposal');
  await page.getByRole('button', { name: '对比并应用' }).click();
  const merge = page.getByRole('dialog', { name: '对比候选与当前工作稿' });
  await expect(merge.getByRole('button', { name: '应用到当前工作稿' })).toBeDisabled();
  for (const choice of await merge.getByLabel('保留手工值').all()) await choice.check();
  await merge.getByRole('button', { name: '应用到当前工作稿' }).click();
  await page.reload();
  await page.getByRole('button', { name: '助手会话' }).click();
  await page
    .getByRole('dialog', { name: '助手会话' })
    .getByRole('button', { name: '继续对话' })
    .first()
    .click();
  await page.getByRole('button', { name: '检查配置', exact: true }).click();
  const inspection = page.getByRole('dialog', { name: '配置检查' });
  await expect(inspection.getByText('当前工作稿检查通过')).toBeVisible();
  await inspection.getByRole('button', { name: '关闭' }).click();
  const checked = await preview();
  assert.notEqual(checked.digest, revised.draft.candidateDigest);
  await fill();
  await expect(
    page.getByRole('region', { name: '候选预览' }).getByRole('searchbox'),
  ).toHaveAttribute('placeholder', '请输入抵达城市');
  await page.getByRole('button', { name: '确认此版试填结果' }).click();
  await page.getByRole('button', { name: '编辑表单名称' }).click();
  await page.getByLabel('表单名称', { exact: true }).fill('旅险城市 · 浏览器验收');
  const [saved] = await Promise.all([
    responses('/save'),
    page.getByRole('button', { name: '保存配置' }).click(),
  ]);
  const res = await page.request.get(
    '/api/platform/forms/' + saved.formId + '/versions/' + saved.versionId,
  );
  assert(res.ok());
  const version = await res.json();
  assert.equal(version.name, '旅险验收初稿');
  const drafts = await page.request.get('/api/platform/form-drafts');
  assert(drafts.ok());
  assert(!(await drafts.json()).some((row) => row.id === second.draft.id));
  assert.equal(JSON.parse(version.text).data.schema.description, '旅险工作稿手工说明');
  assert.equal(cityNode(JSON.parse(version.text).views).props.placeholder, '请输入抵达城市');
  const hash = 'sha256:' + createHash('sha256').update(version.text).digest('hex');
  assert.equal(hash, checked.digest);
  const proof = {
    sessionId: revised.conversation.id,
    originalDigest: second.draft.candidateDigest,
    previewDigest: checked.digest,
    savedDigest: hash,
    ...saved,
  };
  console.log(JSON.stringify(proof));
  if (process.env.CREATE_FORM_ACCEPTANCE_OUTPUT)
    await writeFile(process.env.CREATE_FORM_ACCEPTANCE_OUTPUT, JSON.stringify(proof, null, 2));
} catch (e) {
  console.error(
    (await browser.contexts()[0]?.pages()[0]?.locator('main').innerText())?.slice(-1600),
  );
  throw e;
} finally {
  await browser.close();
}
