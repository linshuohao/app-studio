// Opt-in live acceptance. Run against an isolated Studio/API with local login enabled.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { clickTurn as submit, turnResponse, captureAssistantTurns } from './assistant-browser.mjs';
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
  const first = await clickTurn('发送');
  assert.equal(first.conversation.turns.at(-1).result.kind, 'clarification');
  await page.getByLabel('发送消息').fill('城市只存编码');
  const nextTurn = clickTurn('发送');
  nextTurn.catch(() => {});
  const markdownFixture = process.env.STUDIO_TEST_STREAM_MARKDOWN === '1';
  if (markdownFixture) {
    const log = page.getByRole('log');
    await expect(log.getByRole('status')).toContainText('正在配置');
    await expect(
      log.locator('[data-streamdown="strong"]').filter({ hasText: '城市编码' }),
    ).toBeVisible();
    await expect(log.getByRole('columnheader', { name: '提交值' })).toBeVisible();
    await expect(log.locator('pre')).toContainText('TYO');
    await expect(log.getByRole('region', { name: '候选配置' })).toHaveCount(0);
  }
  let second = await nextTurn;
  if (second.conversation.turns.at(-1).result.kind === 'blocked') {
    await page
      .getByLabel('发送消息')
      .fill(
        '请继续修正上一轮未通过的城市绑定。参考已验证的数据建模：城市工作字段使用 anyOf，对象分支显式定义 id 和 label 两个必填字符串，另一分支是 null。重新检查 remote-select 的绑定和换国清空，保留城市只提交编码的需求。',
      );
    second = await clickTurn('发送');
  }
  const original = second.conversation.turns.at(-1).result;
  assert.equal(original.kind, 'proposal', original.reason ?? original.message);
  async function preview() {
    const [p] = await Promise.all([
      responses('/preview'),
      page.getByRole('button', { name: '预览试填' }).click(),
    ]);
    return p;
  }
  async function fill(region = '候选预览') {
    const area = page.getByRole('region', { name: region });
    const country = area.getByRole('combobox').last();
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
  const panel = page.getByRole('complementary', { name: 'Agent 协作' }),
    grip = page.getByRole('button', { name: '调整浮窗大小' });
  const start = await panel.boundingBox(),
    handle = await grip.boundingBox();
  await page.mouse.move(handle.x + 5, handle.y + 5);
  await page.mouse.down();
  await page.mouse.move(handle.x - 65, handle.y - 30, { steps: 6 });
  await page.mouse.up();
  const resized = await panel.boundingBox();
  assert(resized.width > start.width + 45 && resized.height > start.height + 15);
  await page.getByRole('button', { name: '编辑表单名称' }).click();
  await page.getByLabel('表单名称', { exact: true }).fill('旅险 · 连续协作');
  const [firstSave] = await Promise.all([
    responses('/save'),
    page.getByRole('button', { name: '保存配置', exact: true }).click(),
  ]);
  await expect(page).toHaveURL(new RegExp('work=' + firstSave.workId));
  await expect(panel.getByRole('log')).toContainText('城市只存编码');
  const transferred = await panel.boundingBox();
  for (const k of ['width', 'height', 'x', 'y'])
    assert(Math.abs(transferred[k] - resized[k]) < 2, k);
  await page
    .getByLabel('修改要求')
    .fill(
      '## 旅险修改要求\n\n只把现有城市搜索框的 placeholder 改成“查找目的地城市”，保留刚才确认的其他配置。',
    );
  await captureAssistantTurns(page);
  const [answer] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/turns'), { timeout: 620000 }),
    page.getByRole('button', { name: '发送修改要求' }).click(),
  ]);
  assert(!('history' in answer.request().postDataJSON()));
  assert.equal(new URL(answer.url()).pathname.split('/').at(-2), second.conversation.id);
  await expect(panel.getByRole('heading', { name: '旅险修改要求' })).toBeVisible();
  assert(answer.headers()['content-type'].includes('text/event-stream'));
  const proposal = await turnResponse(answer);
  if (markdownFixture) {
    await expect(panel.getByRole('columnheader', { name: '提交值' }).first()).toBeVisible();
    await page.reload();
    await expect(panel.getByRole('columnheader', { name: '提交值' }).first()).toBeVisible();
    await expect(panel.locator('pre').first()).toContainText('TYO');
  }
  assert(proposal.editorProposal, JSON.stringify(proposal).slice(-800));
  await page.getByRole('button', { name: '对比并应用候选' }).click();
  await page.getByRole('button', { name: '应用到当前工作稿' }).click();
  const previewRequest = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/preview'),
  );
  await page.getByRole('button', { name: '预览配置', exact: true }).click();
  const checked = (await previewRequest).postDataJSON().text;
  await fill('受控预览');
  await expect(
    page.getByRole('region', { name: '受控预览' }).getByRole('searchbox'),
  ).toHaveAttribute('placeholder', '查找目的地城市');
  await page.getByRole('button', { name: '确认此版试填结果' }).click();
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith('/versions') && r.request().method() === 'POST'),
    page.getByRole('button', { name: '保存配置', exact: true }).click(),
  ]);
  assert(response.ok());
  const { versionId } = await response.json();
  const raw = await (
    await page.request.get('/api/platform/forms/' + firstSave.formId + '/versions/' + versionId)
  ).json();
  assert.notEqual(versionId, firstSave.versionId);
  assert.equal(raw.basedOnVersionId, firstSave.versionId);
  assert.equal(raw.text, checked);
  const proof = {
    ...firstSave,
    secondVersionId: versionId,
    basedOnVersionId: raw.basedOnVersionId,
    previewAndSavedSha256: createHash('sha256').update(checked).digest('hex'),
    resized,
    transferred,
  };
  console.log(proof);
  if (process.env.CREATE_FORM_ACCEPTANCE_OUTPUT)
    await writeFile(process.env.CREATE_FORM_ACCEPTANCE_OUTPUT, JSON.stringify(proof, null, 2));
} catch (error) {
  console.error(error);
  throw error;
} finally {
  await browser.close();
}
