import { expect, test } from '@playwright/test';

test('shows saved attempt stages, elapsed time, and interruption details without changing resume', async ({
  page,
  baseURL,
}) => {
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();

  const conversationId = crypto.randomUUID();
  const completedId = crypto.randomUUID();
  const oldId = crypto.randomUUID();
  const interruptedId = crypto.randomUUID();
  const traceId = crypto.randomUUID();
  const completed = {
    turnId: completedId,
    message: '生成旅险表单',
    status: 'done',
    resumable: false,
    elapsedMs: 3620,
    events: [
      { type: 'progress', message: '准备生成候选' },
      { type: 'understanding_item', kind: 'requirement', text: '已废弃的需求' },
      { type: 'understanding_reset' },
      { type: 'understanding_item', kind: 'requirement', text: '重新读取的需求' },
      { type: 'compose_phase', stage: 'schema', status: 'started' },
      { type: 'compose_phase', stage: 'schema', status: 'completed', detail: '字段检查通过' },
    ],
  };
  const old = {
    turnId: oldId,
    message: '早期历史',
    status: 'done',
    resumable: false,
    events: [{ type: 'progress', message: '旧进度条目' }],
  };
  const interrupted = {
    turnId: interruptedId,
    message: '继续检查',
    status: 'interrupted',
    resumable: true,
    elapsedMs: 1100,
    interruptionReason: '编译服务暂时不可用。',
    interruptionTraceId: traceId,
    events: [
      { type: 'compose_phase', stage: 'compile', status: 'started' },
      { type: 'text_delta', delta: '已保留的部分回复' },
    ],
  };

  const saved = {
    id: conversationId,
    title: '历史验收',
    revision: 2,
    turns: [old, completed].map(({ turnId, message }) => ({
      turnId,
      message,
      result: { kind: 'answer', message: '历史中的答复' },
    })),
    attempts: [old, completed, interrupted],
  };
  await page.route('**/agent-conversations/' + conversationId, (route) =>
    route.fulfill({ json: saved }),
  );
  const resumeUrl =
    '/agent-conversations/' + conversationId + '/turns/' + interruptedId + '/resume';
  await page.route('**' + resumeUrl, (route) => {
    const conversation = {
      ...saved,
      revision: 3,
      turns: [
        ...saved.turns,
        {
          turnId: interruptedId,
          message: interrupted.message,
          result: { kind: 'answer', message: '继续后完成' },
        },
      ],
      attempts: [
        old,
        completed,
        {
          turnId: interruptedId,
          message: interrupted.message,
          status: 'done',
          resumable: false,
          elapsedMs: 2500,
          events: interrupted.events,
        },
      ],
    };
    return route.fulfill({
      contentType: 'text/event-stream',
      body: 'data: ' + JSON.stringify({ type: 'data-result', data: { conversation } }) + '\n\n',
    });
  });

  await page.goto('/?page=agent&conversation=' + conversationId);
  const history = page.locator('summary').filter({ hasText: /^用时 3 秒 · Schema · 已结束$/ });
  await expect(history).toBeVisible();
  await expect(page.getByText('字段检查通过', { exact: false })).toBeHidden();
  await history.click();
  await page
    .locator('summary')
    .filter({ hasText: /^Schema · 已完成$/ })
    .click();
  await expect(page.getByText('字段检查通过', { exact: false })).toBeVisible();
  await page.getByText('需求理解', { exact: true }).click();
  await expect(page.getByText('重新核对需求', { exact: true })).toBeVisible();
  await expect(page.getByText('重新读取的需求', { exact: true })).toBeVisible();
  await expect(page.getByText('已废弃的需求', { exact: true })).toHaveCount(0);
  await expect(page.locator('summary').filter({ hasText: /^回复 · 已结束$/ })).toBeVisible();
  await expect(page.getByText(traceId, { exact: true })).toBeVisible();
  await expect(page.getByText('已保留的部分回复', { exact: true })).toBeVisible();

  const request = page.waitForRequest((entry) => entry.url().endsWith(resumeUrl));
  await page.getByRole('button', { name: '继续处理', exact: true }).click();
  await request;
  await expect(page.getByText('继续后完成', { exact: true })).toBeVisible();
  await expect(page.getByText(traceId, { exact: true })).toHaveCount(0);
});
