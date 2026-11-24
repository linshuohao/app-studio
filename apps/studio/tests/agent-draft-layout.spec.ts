import { expect, test } from '@playwright/test';

test('draft title edits in place and only the tab content scrolls', async ({ page, baseURL }) => {
  await page.setViewportSize({ width: 1164, height: 827 });
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  const id = crypto.randomUUID();
  const name = 'Agent 生成的表单 · 标题布局验收';
  const text = JSON.stringify({
    data: { schema: { type: 'object' } },
    views: { main: { material: 'section' } },
    records: Array.from({ length: 150 }, (_, index) => '行' + index),
  });
  await page.route('**/form-drafts/' + id, (route) =>
    route.fulfill({
      json: {
        id,
        name,
        text,
        versionName: '初稿',
        candidateText: text,
        appliedDigest: 'test',
        candidateDigest: 'test',
        revision: 1,
        candidateBaseText: null,
        formId: null,
        versionId: null,
      },
    }),
  );
  await page.goto('/?page=draft&draft=' + id);
  const title = page.getByRole('button', { name: '编辑表单名称' });
  const input = page.getByRole('textbox', { name: '表单名称', exact: true });
  await expect(input).toHaveCount(0);
  await title.focus();
  await page.keyboard.press('Enter');
  await input.fill('取消的名称');
  await input.press('Escape');
  await expect(title).toBeFocused();
  await expect(title).toHaveText(name);
  await title.click();
  await input.fill(name.repeat(4));
  await input.press('Enter');
  await expect(title).toBeFocused();
  await expect(title).toHaveCSS('white-space', 'nowrap');
  await expect(page.getByRole('group', { name: '配置原文工具栏' })).toHaveCount(0);
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  const toolbar = page.getByRole('group', { name: '配置原文工具栏' });
  await toolbar.getByRole('button', { name: '全部展开' }).click();
  const tabs = page.getByRole('navigation', { name: '配置编辑视图' });
  const before = await tabs.boundingBox();
  const region = page.locator('.studio-draft-entry .agent-canvas > .json-component');
  expect(
    await region.evaluate((node) => {
      node.scrollTop = 600;
      return node.scrollTop;
    }),
  ).toBeGreaterThan(0);
  expect(await tabs.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(
    true,
  );
  const back = page.getByRole('button', { name: '返回表单列表' });
  await expect(back).toHaveText('');
  await expect(back.locator('svg')).toBeVisible();
});

test('floating chat wraps long messages and edits its conversation title independently of drag', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1164, height: 827 });
  expect(
    (
      await page.request.post('/api/platform/login', {
        headers: { Origin: baseURL! },
        data: { username: 'studio-test', password: 'local-browser-test-password' },
      })
    ).ok(),
  ).toBeTruthy();
  const draftId = crypto.randomUUID(),
    chatId = crypto.randomUUID();
  const text = '{"views":{"main":{"material":"section"}}}';
  const long = '目的地服务网点预约'.repeat(10);
  let savedTitle = long;
  let saves = 0;
  let releaseDraft!: () => void;
  const draftResponse = new Promise<void>((resolve) => {
    releaseDraft = resolve;
  });
  await page.route('**/form-drafts/' + draftId, async (route) => {
    await draftResponse;
    return route.fulfill({
      json: {
        id: draftId,
        name: '测试草稿',
        versionName: '测试',
        text,
        candidateText: text,
        appliedDigest: 'test',
        candidateDigest: 'test',
        revision: 1,
      },
    });
  });
  await page.route('**/agent-conversations/' + chatId, (route) => {
    if (route.request().method() === 'PATCH') {
      saves++;
      savedTitle = route.request().postDataJSON().title;
    }
    return route.fulfill({
      json: {
        id: chatId,
        title: savedTitle,
        revision: 1,
        turns: [
          {
            turnId: 'one',
            message: long.repeat(10),
            result: { kind: 'answer', message: 'LongToken'.repeat(100) },
          },
        ],
      },
    });
  });
  await page.goto('/?page=draft&draft=' + draftId + '&conversation=' + chatId);
  const panel = page.getByRole('complementary', { name: 'Agent 协作' });
  const title = panel.getByRole('button', { name: /编辑对话标题/ });
  await expect(title).toHaveText(long);
  const composer = panel.getByRole('textbox', { name: '发送消息' });
  await expect(composer).toBeDisabled();
  releaseDraft();
  await expect(composer).toBeEnabled();
  await expect(title).toHaveCSS('text-overflow', 'ellipsis');
  expect(await title.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  for (const area of [panel, panel.getByRole('log')]) {
    expect(await area.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  }
  const before = await panel.boundingBox();
  await title.click();
  const input = panel.getByRole('textbox', { name: '对话标题' });
  await input.fill('取消测试');
  await input.press('Escape');
  await expect(title).toBeFocused();
  expect(saves).toBe(0);
  await title.press('Enter');
  await input.fill('网点预约');
  await input.press('Enter');
  await expect(title).toHaveText('网点预约');
  expect(saves).toBe(1);
  expect(await panel.boundingBox()).toEqual(before);
  await panel.getByRole('button', { name: '移动 Agent 协作浮窗' }).press('ArrowLeft');
  const moved = (await panel.boundingBox())!;
  expect(moved.x).toBeLessThan(before!.x);
  await panel.getByRole('button', { name: '收起', exact: true }).click();
  await expect(panel).toBeHidden();
  await page.getByRole('button', { name: '展开 Agent 聊天' }).press('Enter');
  await expect(panel).toBeVisible();
  await expect.poll(async () => (await panel.boundingBox())?.x).toBe(moved.x);
  await page.reload();
  await expect(title).toHaveText('网点预约');
});
