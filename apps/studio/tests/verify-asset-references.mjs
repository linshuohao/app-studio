import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { captureAssistantTurns, turnResponse } from './assistant-browser.mjs';

const origin = new URL(process.env.CREATE_FORM_STUDIO_URL).origin;
const browser = await chromium.launch({
  channel: process.env.STUDIO_TEST_BROWSER_CHANNEL || 'chrome',
});
try {
  const page = await browser.newPage({ baseURL: origin });
  await page.goto('/');
  await page.getByRole('button', { name: '以本地开发账号登录' }).click();
  const nav = page.getByRole('navigation', { name: '主导航' });
  await nav.waitFor();
  const input = page.getByLabel('发送消息', { exact: true });
  const attached = page.getByRole('list', { name: '待发送的引用' });
  async function post(path, data) {
    const response = await page.request.post('/api/platform' + path, {
      headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
      data,
    });
    assert(response.ok(), await response.text());
    return response.json();
  }
  const { formId } = await post('/forms', { name: '对象引用验收' });
  const path = '/forms/' + formId;
  const config = {
    protocolVersion: '1.0',
    id: 'references',
    version: '1.0',
    data: { schema: { type: 'object', properties: { referenceField: { type: 'string' } } } },
    views: { default: { material: 'section', props: { title: '引用区' } } },
    constraints: [{ id: 'reference-validation' }],
    reactions: [{ id: 'reference-reaction' }],
  };
  const work = await post(path + '/work', { name: '对象版本', text: JSON.stringify(config) });
  const saved = await post(path + '/versions', {
    workId: work.id,
    text: JSON.stringify(config),
    basedOnVersionId: null,
  });

  await page.goto('/?catalog=functions');
  await page
    .getByRole('button', { name: /^引用到 Agent：/ })
    .first()
    .click();
  await expect(attached).toContainText('纯函数');
  const assetUrl = new URL(await attached.getByRole('link').first().getAttribute('href'), origin);
  const asset = {
    kind: 'function',
    assetId: assetUrl.searchParams.get('asset'),
    assetVersion: assetUrl.searchParams.get('assetVersion'),
    artifactDigest: assetUrl.searchParams.get('assetDigest'),
  };
  assert(asset.artifactDigest);
  const badAsset = await page.request.post(
    '/api/platform/agent-conversations/' + randomUUID() + '/turns',
    {
      headers: { Origin: origin },
      data: {
        turnId: randomUUID(),
        revision: 0,
        message: '校验引用',
        references: [{ ...asset, artifactDigest: 'incorrect' }],
      },
    },
  );
  assert.equal(badAsset.status(), 404);
  await nav.getByRole('button', { name: '物料', exact: true }).click();
  await page
    .getByRole('button', { name: /^引用到 Agent：/ })
    .first()
    .click();
  await expect(attached).toContainText('物料');
  await input.pressSequentially('/');
  for (const command of ['form', 'function', 'material'])
    await expect(page.getByRole('option', { name: new RegExp('/' + command) })).toBeVisible();
  await input.pressSequentially('fu');
  await expect(page.getByRole('option')).toHaveCount(1);
  await input.press('Tab');
  await expect(page.getByRole('searchbox', { name: '搜索纯函数' })).toBeFocused();
  await page.keyboard.press('Escape');
  await input.pressSequentially('/material');
  await expect(page.getByRole('searchbox', { name: '搜索物料' })).toBeFocused();
  await page.keyboard.press('Escape');

  await page.goto('/?form=' + formId + '&work=' + work.id);
  const select = page.getByRole('button', { name: '引用页面对象' });
  const section = page.getByRole('navigation', { name: '配置编辑视图' });
  await select.click();
  await expect(select).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Escape');
  await expect(select).toHaveAttribute('aria-pressed', 'false');
  async function pick(label, pointer) {
    await section.getByRole('button', { name: label, exact: true }).click();
    await select.click();
    await page
      .locator('[data-reference-path="' + pointer + '"]:visible')
      .first()
      .click();
    await expect(attached.getByRole('link').first()).toBeVisible();
  }
  await pick('字段', '/data/schema/properties/referenceField');
  await pick('布局', '/views/default');
  await pick('校验', '/constraints/0');
  await pick('联动', '/reactions/0');
  await expect(attached.getByRole('listitem')).toHaveCount(4);
  await input.pressSequentially('/function');
  const assetSearch = page.getByRole('searchbox', { name: '搜索纯函数' });
  await assetSearch.fill(asset.assetId);
  await expect(
    page
      .getByRole('dialog')
      .getByRole('button', { name: /纯函数 · .* · v/ })
      .first(),
  ).toBeVisible();
  await assetSearch.press('Enter');
  await expect(attached.getByRole('listitem')).toHaveCount(5);

  await input.fill('只回答问题，不创建或修改表单。请告诉我所附引用里字段的类型和两个规则的 ID。');
  await captureAssistantTurns(page);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/turns') && r.request().method() === 'POST', {
      timeout: 120000,
    }),
    input.press('Enter'),
  ]);
  const payload = response.request().postDataJSON();
  assert.deepEqual(payload.references[4], asset);
  assert.deepEqual(
    payload.references.slice(0, 4),
    [
      '/data/schema/properties/referenceField',
      '/views/default',
      '/constraints/0',
      '/reactions/0',
    ].map((pointer) => ({ formId, versionId: saved.versionId, pointer })),
  );
  assert(!payload.formId && !payload.workId);
  const result = await turnResponse(response);
  const turn = result.conversation.turns.at(-1);
  assert.equal(turn.result.kind, 'answer');
  assert.match(turn.result.message, /reference-validation/);
  assert.match(turn.result.message, /reference-reaction/);
  assert(turn.references.every((item) => !('text' in item)));
  assert.equal(turn.references.length, 5);
  await page.goto('/?page=agent&conversation=' + result.conversation.id);
  const sourceLink = page.getByRole('link', { name: /字段 · referenceField/ });
  await expect(sourceLink).toHaveAttribute('href', /object=/);
  const [sourcePage] = await Promise.all([page.waitForEvent('popup'), sourceLink.click()]);
  await expect(
    sourcePage.locator('[data-json-path="/data/schema/properties/referenceField"].json-highlight'),
  ).toBeVisible();
  console.log('通过资产入口、三条斜杠命令、四种页面对象以及固定版本对话验收。');
} finally {
  await browser.close();
}
