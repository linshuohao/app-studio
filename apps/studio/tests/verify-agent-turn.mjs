// Live acceptance against an isolated Studio, Platform DB and Agent DB.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { clickTurn } from './assistant-browser.mjs';
const origin = new URL(process.env.CREATE_FORM_STUDIO_URL ?? 'http://127.0.0.1:3200');
assert(['localhost', '127.0.0.1'].includes(origin.hostname));
const browser = await chromium.launch({
  channel: process.env.STUDIO_TEST_BROWSER_CHANNEL || 'chrome',
});
try {
  const page = await browser.newPage({ baseURL: origin.origin });
  page.setDefaultTimeout(30000);
  await page.goto('/');
  await page.getByRole('button', { name: '以本地开发账号登录' }).click();
  await page.getByRole('button', { name: '表单助手', exact: true }).click();
  async function send(message) {
    await page.getByLabel('发送消息', { exact: true }).fill(message);
    const reply = await clickTurn(page);
    for (const turn of reply.conversation.turns)
      for (const key of ['requirements_trace', 'check', 'repair_context', 'candidate_text'])
        assert(!(key in turn.result), 'private turn field: ' + key);
    return reply;
  }
  const chat = await send('你好，请用一句话解释表单里的必填字段是什么。');
  assert.equal(chat.conversation.turns.at(-1).result.kind, 'answer');
  assert(!chat.draft);
  const drafts = await page.request.get('/api/platform/form-drafts');
  assert(drafts.ok());
  assert.equal((await drafts.json()).length, 0);
  const id = chat.conversation.id;
  const ask = await send(
    '现在帮我创建一个会议报名表。报名人姓名必填，报名方式有两个相互冲突的业务要求：必须匿名，同时必须展示并提交真实姓名。请先问我选择哪一项。',
  );
  assert.equal(ask.conversation.id, id);
  assert.equal(ask.conversation.turns.at(-1).result.kind, 'clarification');
  const side = await send('先解释一下你刚才为什么要问我这个问题，暂时不用修改表单。');
  assert.equal(side.conversation.turns.at(-1).result.kind, 'answer');
  let created = await send('选择实名，姓名必填，只需要一个姓名输入框，按这个生成。');
  if (created.conversation.turns.at(-1).result.kind === 'blocked') {
    const reason = created.conversation.turns.at(-1).result.reason;
    console.log('模型返回受阻：', reason);
    created = await send(
      '请保留已经确认的实名和姓名必填需求，针对上一轮具体编译诊断修复后重新检查当前候选。',
    );
  }
  const final = created.conversation.turns.at(-1).result;
  assert.equal(final.kind, 'proposal', final.reason ?? final.message);
  const draft = created.draft;
  assert(draft && draft.id !== id);
  assert.equal(
    draft.candidateDigest,
    'sha256:' + createHash('sha256').update(draft.candidateText).digest('hex'),
  );
  async function rawInput() {
    await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
    await page.getByRole('button', { name: '文本查看 / 修复' }).click();
    return page.getByRole('textbox', { name: '配置原文' });
  }
  if (process.env.STUDIO_TEST_PROMOTION === '1') {
    await page.getByRole('button', { name: '预览试填', exact: true }).click();
    await page.getByRole('button', { name: '确认此版试填结果' }).click();
    await page.getByRole('button', { name: '保存配置', exact: true }).click();
    await expect(page).toHaveURL(/work=/);
    const panel = page.getByRole('complementary', { name: 'Agent 协作' });
    await expect(panel.getByRole('log')).toContainText('选择实名');
    await page.getByLabel('修改要求').fill('解释当前报名表的姓名字段，不改配置。');
    const updated = await clickTurn(page, '发送修改要求');
    assert.equal(updated.conversation.id, id);
    assert.equal(updated.conversation.turns.length, created.conversation.turns.length + 1);
    assert.equal(updated.conversation.turns.at(-1).result.kind, 'answer');
    assert.equal(updated.conversation.workId, new URL(page.url()).searchParams.get('work'));
    await page.reload();
    await expect(panel.getByRole('log')).toContainText('解释当前报名表');
    console.log('通过浏览器验证：创建任务保存后同一个会话在编辑器继续，刷新后从 Agent 加载历史。');
  } else {
    const raw = await rawInput();
    const firstEdit = JSON.parse(await raw.inputValue());
    firstEdit.data.schema.description = '会话删除前保存的手工编辑';
    await raw.fill('');
    await expect(raw).toBeEditable();
    await raw.fill(JSON.stringify(firstEdit));
    await page.getByRole('button', { name: '编辑表单名称' }).click();
    await page.getByLabel('表单名称', { exact: true }).fill('独立工作稿验收');
    let releaseCheckpoint, completedInterceptor;
    const released = new Promise((resolve) => {
      completedInterceptor = resolve;
    });
    const paused = new Promise((resolve) => {
      releaseCheckpoint = resolve;
    });
    const checkpointPath = '**/form-drafts/' + draft.id;
    await page.route(checkpointPath, async (route) => {
      if (route.request().method() === 'PATCH') await paused;
      try {
        await route.continue();
      } finally {
        completedInterceptor();
      }
    });
    await page.getByRole('button', { name: '返回表单列表' }).click();
    try {
      await expect(page.getByRole('button', { name: '编辑表单名称' })).toBeDisabled();
      await expect(page.locator('.agent-workbench')).toHaveAttribute('inert', '');
    } finally {
      releaseCheckpoint();
    }
    await released;
    await page.unroute(checkpointPath);
    await page.getByRole('button', { name: '助手会话', exact: true }).click();
    const conversation = page
      .getByRole('dialog', { name: '助手会话' })
      .getByRole('listitem')
      .filter({ hasText: chat.conversation.title })
      .first();
    page.once('dialog', (d) => d.accept());
    await conversation.getByRole('button', { name: '删除', exact: true }).click();
    await expect(conversation).toHaveCount(0);
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    assert.equal((await page.request.get('/api/platform/agent-conversations/' + id)).status(), 404);
    const draftUrl = '/api/platform/form-drafts/' + draft.id;
    const afterDelete = await (await page.request.get(draftUrl)).json();
    assert.equal(
      JSON.parse(afterDelete.text).data.schema.description,
      firstEdit.data.schema.description,
    );
    await page.reload();
    await page.getByRole('button', { name: '表单草稿', exact: true }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: '独立工作稿验收' })
      .getByRole('button', { name: '打开草稿' })
      .click();
    const reopened = await rawInput(),
      secondEdit = JSON.parse(await reopened.inputValue());
    assert.equal(secondEdit.data.schema.description, firstEdit.data.schema.description);
    secondEdit.data.schema.description = '会话删除后完成的手工编辑';
    await reopened.fill(JSON.stringify(secondEdit));
    const changed = await page.request.patch(draftUrl, {
      headers: { Origin: origin.origin },
      data: {
        revision: afterDelete.revision,
        text: afterDelete.text,
        name: afterDelete.name,
        versionName: '另一窗口的版本',
        appliedDigest: afterDelete.appliedDigest,
      },
    });
    assert(changed.ok(), await changed.text());
    await page.reload();
    await page.getByRole('button', { name: '表单草稿', exact: true }).click();
    await page
      .getByRole('listitem')
      .filter({ hasText: afterDelete.name })
      .getByRole('button', { name: '打开草稿' })
      .click();
    const recovery = page.getByRole('dialog', { name: '恢复本机编辑' });
    await expect(recovery).toBeVisible();
    await recovery.getByRole('button', { name: '恢复本机内容' }).click();
    assert.equal(
      JSON.parse(await (await rawInput()).inputValue()).data.schema.description,
      secondEdit.data.schema.description,
    );
    await page.getByRole('button', { name: '预览试填', exact: true }).click();
    await page.getByRole('button', { name: '确认此版试填结果' }).click();
    const [saved] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith(draftUrl + '/save')),
      page.getByRole('button', { name: '保存配置', exact: true }).click(),
    ]);
    assert(saved.ok(), await saved.text());
    const { formId, versionId } = await saved.json();
    const stored = await (
      await page.request.get('/api/platform/forms/' + formId + '/versions/' + versionId)
    ).json();
    assert.equal(
      JSON.parse(stored.text).data.schema.description,
      secondEdit.data.schema.description,
    );
    console.log(
      '通过浏览器验证：纯问答、创建/澄清/插问、交付独立草稿、删除会话、恢复手工编辑、再次编辑、预览并保存。',
    );
  }
} finally {
  await browser.close();
}
