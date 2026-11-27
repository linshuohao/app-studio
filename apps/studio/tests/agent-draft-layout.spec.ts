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
  let holding = false;
  await page.route('**/form-drafts/' + id + '/editing?*', (route) =>
    route.fulfill({ json: { holder: holding ? 'human' : null, own: holding } }),
  );
  await page.route('**/form-drafts/' + id + '/editing', (route) => {
    holding = true;
    return route.fulfill({
      json: {
        token: route.request().postDataJSON().grantId,
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      },
    });
  });
  await page.route('**/form-drafts/' + id + '/editing/release', (route) => {
    holding = false;
    return route.fulfill({ status: 204 });
  });
  await page.goto('/?page=draft&draft=' + id);
  const title = page.getByRole('button', { name: '编辑表单名称' });
  const input = page.getByRole('textbox', { name: '表单名称', exact: true });
  await expect(input).toHaveCount(0);
  await expect(title).toHaveCount(0);
  await expect(page.getByRole('heading', { name, exact: true })).toHaveText(name);
  await page.getByRole('button', { name: '开始编辑', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '你正在编辑这份草稿' })).toBeVisible();
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
  await page.getByRole('button', { name: '放弃编辑', exact: true }).click();
  await page.getByRole('button', { name: '确认放弃', exact: true }).click();
  await expect(title).toHaveCount(0);
  await expect(page.getByRole('heading', { name, exact: true })).toHaveText(name);
  expect(holding).toBe(false);
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
            message: Array.from({ length: 40 }, () => long).join('\n'),
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
  const history = panel.getByRole('log');
  const latest = panel.getByRole('button', { name: '回到最新消息' });
  await expect.poll(() => history.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await history.evaluate((el) => {
    el.scrollTop = 0;
  });
  await expect(latest).toBeVisible();
  await latest.press('Enter');
  await expect(latest).toBeHidden();
  await expect(history).toBeFocused();
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

test('opens the affected editor when an incomplete rule has no JSON node', async ({
  page,
  baseURL,
}) => {
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  const id = crypto.randomUUID();
  const text = JSON.stringify({
    data: { schema: { type: 'object' } },
    views: { default: { material: 'section' } },
  });
  const remaining = {
    message: 'R26 联动待补齐',
    sourcePointer: '/reactions',
    requirementIds: ['R26'],
  };
  await page.route('**/form-drafts/' + id, (route) =>
    route.fulfill({
      json: {
        id,
        text,
        name: '部分草稿',
        versionName: '初稿',
        candidateText: text,
        appliedDigest: 'initial',
        candidateDigest: 'initial',
        revision: 1,
        draftIssues: [remaining],
        appliedDraftIssues: [
          remaining,
          { message: 'R27 旧问题', sourcePointer: '/views', requirementIds: ['R27'] },
        ],
      },
    }),
  );
  await page.goto('/?page=draft&draft=' + id);
  const issues = page.getByRole('region', { name: '当前工作稿待处理项' });
  await expect(issues.getByText('R27 旧问题')).toHaveCount(0);
  const issue = issues.getByRole('button', { name: '定位问题 R26' });
  await expect(issue).toBeVisible();
  await issue.focus();
  await issue.press('Enter');
  const tabs = page.getByRole('navigation', { name: '配置编辑视图' });
  await expect(tabs.getByRole('button', { name: '联动', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('button', { name: '检查配置', exact: true })).toBeEnabled();
});

test('allows a new message when an interrupted Agent turn is pinned to an older draft', async ({
  page,
  baseURL,
}) => {
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  const draftId = crypto.randomUUID();
  const conversation = crypto.randomUUID();
  const text = '{"data":{"schema":{"type":"object"}},"views":{"default":{"material":"section"}}}';
  await page.route('**/form-drafts/' + draftId, (route) =>
    route.fulfill({
      json: {
        id: draftId,
        text,
        candidateText: text,
        name: '最新草稿',
        versionName: '初稿',
        candidateDigest: 'candidate',
        appliedDigest: 'candidate',
        revision: 2,
      },
    }),
  );
  await page.route('**/agent-conversations/' + conversation, (route) =>
    route.fulfill({
      json: {
        id: conversation,
        title: '继续草稿',
        revision: 0,
        turns: [],
        attempts: [
          {
            turnId: 'old',
            draftId,
            draftRevision: 1,
            status: 'interrupted',
            resumable: true,
            message: '继续修复',
            events: [],
          },
        ],
      },
    }),
  );
  await page.goto('/?page=draft&draft=' + draftId + '&conversation=' + conversation);
  const composer = page.getByRole('textbox', { name: '发送消息' });
  const openChat = page.getByRole('button', { name: '展开 Agent 聊天', exact: true });
  await expect(composer.or(openChat)).toBeVisible();
  if (await openChat.isVisible()) await openChat.click();
  await composer.fill('检查当前草稿');
  await expect(page.getByRole('button', { name: '发送', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: '继续处理' })).toHaveCount(0);
});

test('finishing draft editing saves the local change before releasing the grant', async ({
  page,
  baseURL,
}) => {
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  const id = crypto.randomUUID();
  const text = '{"data":{"schema":{"type":"object"}},"views":{"default":{"material":"section"}}}';
  const draft = {
    id,
    text,
    name: '原草稿',
    versionName: '初稿',
    candidateText: text,
    candidateDigest: 'original',
    appliedDigest: 'original',
    revision: 1,
  };
  let grant = '';
  let attempts = 0;
  const writes: string[] = [];
  await page.route('**/form-drafts/' + id, (route) => {
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON();
      expect(writes).toEqual([]);
      expect(body.editingToken).toBe(grant);
      writes.push('save');
      draft.name = body.name;
      draft.revision += 1;
    }
    return route.fulfill({ json: draft });
  });
  await page.route('**/form-drafts/' + id + '/editing?*', (route) =>
    route.fulfill({
      json: { holder: grant ? 'human' : null, own: !!grant },
    }),
  );
  await page.route('**/form-drafts/' + id + '/editing', (route) => {
    const grantId = route.request().postDataJSON().grantId;
    attempts += 1;
    if (attempts === 1) {
      grant = grantId;
      return route.abort('connectionreset');
    }
    expect(grantId).toBe(grant);
    return route.fulfill({
      json: { token: grant, expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
    });
  });
  await page.route('**/form-drafts/' + id + '/editing/release', (route) => {
    expect(route.request().postDataJSON()).toEqual({ token: grant });
    writes.push('release');
    grant = '';
    return route.fulfill({ status: 204 });
  });
  await page.goto('/?page=draft&draft=' + id);
  const start = page.getByRole('button', { name: '开始编辑', exact: true });
  await start.click();
  await expect(
    page.getByRole('alert').filter({ hasText: '无法连接到服务，请重试。' }),
  ).toBeVisible();
  await start.click();
  const title = page.getByRole('button', { name: '编辑表单名称' });
  await title.click();
  const name = page.getByRole('textbox', { name: '表单名称', exact: true });
  await name.fill('修改后的草稿');
  await name.press('Enter');
  await page.getByRole('button', { name: '完成编辑', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始编辑', exact: true })).toBeEnabled();
  await expect(title).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '修改后的草稿', exact: true })).toHaveText(
    '修改后的草稿',
  );
  expect(writes).toEqual(['save', 'release']);
});
