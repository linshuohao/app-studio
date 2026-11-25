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
  await page.getByRole('navigation', { name: '主导航' }).waitFor();
  async function post(path, data) {
    const response = await page.request.post('/api/platform' + path, {
      headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
      data,
    });
    assert(response.ok(), await response.text());
    return response.json();
  }
  const name = '引用验收 A';
  const { formId } = await post('/forms', { name });
  const path = '/forms/' + formId;
  const field = 'referenceOnlyQZ41';
  const config = {
    data: {
      schema: {
        type: 'object',
        properties: { [field]: { type: 'string', title: '验收编号' } },
        required: [field],
      },
    },
  };
  const work = await post(path + '/work', { name: '来源工作版本', text: JSON.stringify(config) });
  const v1 = await post(path + '/versions', {
    workId: work.id,
    name: '来源第一版',
    text: JSON.stringify(config),
    basedOnVersionId: null,
  });

  await page.reload();
  await page.getByRole('button', { name: '管理 ' + name }).click();
  await page.getByRole('menuitem', { name: '引用到 Agent' }).click();
  const input = page.getByLabel('发送消息', { exact: true });
  const remove = page.getByRole('button', { name: '移除引用 ' + name });
  await expect(remove).toBeVisible();
  await remove.click();
  await page.getByRole('button', { name: '打开 ' + name }).click();
  await page.getByRole('button', { name: '引用到 Agent' }).click();
  await expect(remove).toBeVisible();
  await remove.click();

  await page.getByRole('button', { name: '添加引用', exact: true }).click();
  await page.getByRole('dialog', { name: '引用表单' }).waitFor();
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await input.pressSequentially('/');
  const command = page.getByRole('option', { name: '/form 引用表单' });
  await expect(command).toBeVisible();
  await input.pressSequentially('f');
  await expect(command).toBeVisible();
  await input.press('Tab');
  const searchBox = page.getByRole('searchbox', { name: '搜索表单' });
  await expect(searchBox)
    .toBeFocused()
    .catch(async (error) => {
      console.error(
        '焦点现场',
        await searchBox.evaluate((input) => ({
          active: document.activeElement?.outerHTML.slice(0, 230),
          modal: input.closest('dialog')?.open,
          hasFocus: document.hasFocus(),
        })),
      );
      throw error;
    });
  await page.keyboard.press('Escape');
  await expect(input).toBeFocused();
  await input.pressSequentially('/form');
  const search = page.getByRole('searchbox', { name: '搜索表单' });
  await search.fill(name);
  await expect(
    page.getByRole('button', { name: /引用验收 A/ }).filter({ hasText: name }),
  ).toBeVisible();
  await search.press('Enter');
  await expect(remove).toBeVisible();
  await expect(input).toHaveValue('');

  const v2 = await post(path + '/versions', {
    workId: work.id,
    name: '来源第二版',
    text: JSON.stringify({
      data: { schema: { type: 'object', properties: { otherField: { type: 'string' } } } },
    }),
    basedOnVersionId: v1.versionId,
  });
  assert.notEqual(v2.versionId, v1.versionId);

  const turnRoute = '**/agent-conversations/*/turns';
  const injectInvalidVersion = (route) => {
    const data = route.request().postDataJSON();
    return route.continue({
      postData: JSON.stringify({ ...data, references: [{ formId, versionId: randomUUID() }] }),
    });
  };
  await page.route(turnRoute, injectInvalidVersion);
  await input.fill('引用失效校验');
  const [invalid] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/turns') && r.request().method() === 'POST'),
    input.press('Enter'),
  ]);
  assert.equal(invalid.status(), 404);
  await expect(page.getByRole('alert').filter({ hasText: '引用的表单版本已不可用' })).toBeVisible();
  await expect(input).toHaveValue('引用失效校验');
  await expect(remove).toBeVisible();
  await page.unroute(turnRoute, injectInvalidVersion);
  await input.fill('请参考附带的表单配置创建一张新表单 B。');
  await input.press('Shift+Enter');
  await expect(input).toHaveValue(/\n$/);
  await input.pressSequentially(
    '只复用参考表单中的唯一必填文本字段，保留原字段键和名称。生成一屏一个文本输入框。',
  );
  await captureAssistantTurns(page);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/turns') && r.request().method() === 'POST', {
      timeout: 620000,
    }),
    input.press('Enter'),
  ]);
  const payload = response.request().postDataJSON();
  assert.deepEqual(payload.references, [{ formId, versionId: v1.versionId }]);
  assert(!payload.formId && !payload.workId);
  const result = await turnResponse(response);
  const turn = result.conversation.turns.at(-1);
  assert.equal(turn.result.kind, 'proposal', turn.result.reason ?? turn.result.message);
  assert.equal(turn.references[0].versionId, v1.versionId);
  assert(!('text' in turn.references[0]));
  assert(result.draft && !result.draft.formId);
  const createdSchema = JSON.parse(result.draft.candidateText).data.schema;
  assert(createdSchema.properties[field]);
  assert(createdSchema.required.includes(field));
  const preview = await post('/form-drafts/' + result.draft.id + '/preview', {
    revision: result.draft.revision,
    digest: result.draft.candidateDigest,
    workingText: result.draft.candidateText,
  });
  assert(preview.prepared && preview.digest === result.draft.candidateDigest);
  const source = await page.request.get('/api/platform' + path + '/versions/' + v2.versionId);
  assert.deepEqual(JSON.parse((await source.json()).text).data.schema.properties, {
    otherField: { type: 'string' },
  });
  await page.goto('/?page=agent&conversation=' + result.conversation.id);
  await expect(page.getByRole('link', { name: /引用验收 A/ })).toHaveAttribute(
    'href',
    new RegExp(v1.versionId),
  );
  console.log('通过 A → B 浏览器验收：版本固定、Compiler 检查、独立候选、历史回链。');
} finally {
  await browser.close();
}
