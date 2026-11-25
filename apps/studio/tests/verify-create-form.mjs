// Live acceptance against the isolated Studio, Platform and Agent.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { clickTurn } from './assistant-browser.mjs';

const origin = new URL(process.env.CREATE_FORM_STUDIO_URL ?? 'http://127.0.0.1:3200');
assert(['localhost', '127.0.0.1'].includes(origin.hostname));
const prd = await readFile(
  new URL('../../../services/agent/examples/08-city-search-object/complete.md', import.meta.url),
  'utf8',
);
const browser = await chromium.launch({
  channel: process.env.STUDIO_TEST_BROWSER_CHANNEL || 'chrome',
});

function cityField(value, label) {
  if (!value || typeof value !== 'object') return;
  const owner = value.material === 'field' ? value.props?.label : label;
  if (value.material === 'remote-select')
    return { node: value, label: owner ?? value.props?.label };
  return Object.values(value)
    .map((child) => cityField(child, owner))
    .find(Boolean);
}

const context = await browser.newContext({ baseURL: origin.origin });
let page = await context.newPage();
context.setDefaultTimeout(30000);
function watchErrors(target) {
  target.on('pageerror', (error) => console.error('Studio error:', error.message));
  target.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.error('Studio console:', message.text());
  });
}
watchErrors(page);

try {
  const modelStarted = performance.now();
  await page.goto('/');
  await page.getByRole('button', { name: '以本地开发账号登录' }).click();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: 'Agent', exact: true })
    .click();
  await page.getByLabel('发送消息', { exact: true }).fill(prd.trim());
  const created = await clickTurn(page);
  const original = created.conversation.turns.at(-1).result;
  assert.equal(original.kind, 'proposal', original.reason ?? original.message);
  const draft = created.draft;
  const firstCity = cityField(JSON.parse(draft.candidateText).views);
  assert(firstCity?.label, 'Remote select must be labelled in the view.');
  assert.equal(
    draft.candidateDigest,
    'sha256:' + createHash('sha256').update(draft.candidateText).digest('hex'),
  );
  const generationMs = performance.now() - modelStarted;
  console.log('从 PRD 生成草稿', JSON.stringify({ generationMs, digest: draft.candidateDigest }));

  const [draftPage] = await Promise.all([
    context.waitForEvent('page'),
    page.getByRole('link').filter({ hasText: draft.name }).click(),
  ]);
  page = draftPage;
  watchErrors(page);
  await expect(page.getByLabel('版本名称')).not.toHaveValue('');
  await page.getByLabel('版本名称').fill('旅险验收初稿');
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('main').getByRole('button', { name: '表单草稿', exact: true }).click();
  await page
    .getByRole('dialog', { name: '表单草稿', exact: true })
    .getByRole('row')
    .filter({ hasText: draft.name })
    .getByRole('button', { name: '打开草稿', exact: true })
    .click();
  await expect(page.getByLabel('版本名称')).toHaveValue('旅险验收初稿');
  await page.getByRole('button', { name: '选择近期 Agent 聊天', exact: true }).click();
  await page
    .getByRole('region', { name: '近期聊天' })
    .getByRole('button')
    .filter({ hasText: created.conversation.title })
    .click();
  await expect(page.getByRole('log', { name: '对话记录' })).toContainText(
    '另外提供选填的目的地城市',
  );

  async function responseFor(action, click) {
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) =>
          new URL(r.url()).pathname.endsWith('/form-drafts/' + draft.id + '/' + action) &&
          r.request().method() === 'POST',
      ),
      click(),
    ]);
    assert(response.ok(), await response.text());
    return response.json();
  }
  async function preview() {
    return responseFor('preview', () =>
      page.getByRole('button', { name: '预览试填', exact: true }).click(),
    );
  }
  async function fill() {
    const area = page.getByRole('region', { name: '候选预览' });
    const country = area.getByRole('combobox');
    await expect(country).toBeVisible();
    await expect(area.getByText('此处暂时不可用')).toHaveCount(0);
    async function selectCountry(name) {
      await country.selectOption(await country.getByRole('option', { name }).getAttribute('value'));
    }
    async function searchAndSelect(query, label) {
      await area.getByRole('searchbox').fill(query);
      await area.getByRole('button', { name: '搜索', exact: true }).click();
      await area.getByRole('button', { name: label, exact: true }).click();
      await expect(area.getByText('当前选择：' + label)).toBeVisible();
    }
    await selectCountry(/中国/);
    await searchAndSelect('上海', '上海市（模拟）');
    await selectCountry(/日本/);
    await expect(area.getByText('当前选择：未选择')).toBeVisible();
    await searchAndSelect('东京', '东京市（模拟）');
    await expect(area.getByText('此处暂时不可用')).toHaveCount(0);
  }
  assert.equal((await preview()).digest, draft.candidateDigest);
  await fill();
  await page.getByRole('button', { name: '确认此版试填结果' }).click();
  console.log('草稿重新打开并完成首次试填');

  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await page.getByRole('button', { name: '文本查看 / 修复' }).click();
  const raw = page.getByRole('textbox', { name: '配置原文', exact: true });
  const working = JSON.parse(await raw.inputValue());
  cityField(working.views).node.props ??= {};
  cityField(working.views).node.props.placeholder = '请输入抵达城市';
  working.data.schema.description = '旅险工作稿手工说明';

  const composer = page.getByLabel('发送消息', { exact: true });
  if (!(await composer.isVisible()))
    await page.getByRole('button', { name: '展开 Agent 聊天', exact: true }).click();
  await composer.fill('请把' + firstCity.label + '搜索框的提示文字改为“搜索目的地城市”。');
  let release;
  const checkpoint = new Promise((resolve) => {
    release = resolve;
  });
  let captured;
  const submitted = new Promise((resolve) => {
    captured = resolve;
  });
  await page.route('**/turns', async (route) => {
    captured();
    await checkpoint;
    await route.continue();
  });
  const revisedPromise = clickTurn(page, '发送', () => composer.press('Enter'));
  try {
    await Promise.race([submitted, revisedPromise.then(() => assert.fail('未捕获修改轮次请求'))]);
    await raw.fill(JSON.stringify(working));
  } finally {
    release();
  }
  const revised = await revisedPromise;
  await page.unroute('**/turns');
  const latest = revised.conversation.turns.at(-1).result;
  assert.equal(latest.kind, 'proposal', latest.reason ?? latest.message);
  assert.equal(
    cityField(JSON.parse(revised.draft.candidateText).views).node.props.placeholder,
    '搜索目的地城市',
  );

  await page.getByRole('button', { name: '对比并应用' }).click();
  const merge = page.getByRole('dialog', { name: '对比候选与当前工作稿' });
  await expect(merge.getByRole('button', { name: '应用到当前工作稿' })).toBeDisabled();
  const manualChoices = await merge.getByLabel('保留手工值').all();
  assert(manualChoices.length > 0, 'Expected a conflict on the edited placeholder.');
  for (const choice of manualChoices) await choice.check();
  await merge.getByRole('button', { name: '应用到当前工作稿' }).click();

  await page.getByRole('button', { name: '检查配置', exact: true }).click();
  const inspection = page.getByRole('region', { name: '配置检查结果' });
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
  const saved = await responseFor('save', () =>
    page.getByRole('button', { name: '保存配置', exact: true }).click(),
  );
  await expect(page).toHaveURL(/work=/);
  const response = await page.request.get(
    '/api/platform/forms/' + saved.formId + '/versions/' + saved.versionId,
  );
  assert(response.ok());
  const version = await response.json();
  assert.equal(version.name, '旅险验收初稿');
  const drafts = await page.request.get('/api/platform/form-drafts');
  assert(drafts.ok());
  assert(!(await drafts.json()).some((row) => row.id === draft.id));
  assert.equal(JSON.parse(version.text).data.schema.description, '旅险工作稿手工说明');
  assert.equal(cityField(JSON.parse(version.text).views).node.props.placeholder, '请输入抵达城市');
  const hash = 'sha256:' + createHash('sha256').update(version.text).digest('hex');
  assert.equal(hash, checked.digest);
  const proof = {
    sessionId: revised.conversation.id,
    generationMs,
    originalDigest: draft.candidateDigest,
    previewDigest: checked.digest,
    savedDigest: hash,
    ...saved,
  };
  console.log(JSON.stringify(proof));
  if (process.env.CREATE_FORM_ACCEPTANCE_OUTPUT)
    await writeFile(process.env.CREATE_FORM_ACCEPTANCE_OUTPUT, JSON.stringify(proof, null, 2));
} catch (error) {
  console.error(
    (
      await page
        .locator('body')
        .innerText({ timeout: 1000 })
        .catch(() => '')
    )?.slice(-1800),
  );
  throw error;
} finally {
  await browser.close();
}
