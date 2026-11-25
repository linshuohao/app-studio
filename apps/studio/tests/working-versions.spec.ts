import {
  chooseWorkingVersionAction,
  workingVersionMenu,
  workingVersionName,
} from './working-version-menu';
import { expect, test } from '@playwright/test';
import { basicInformationDefinition } from './basic-information-fixture';
test('one editable row retains its snapshots, locks on release and forks independently', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL!;
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: origin },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: '新建表单', exact: true }).click();
  await page.getByLabel('表单名称').fill('分层工作台验收');
  await page.getByRole('button', { name: '创建表单', exact: true }).click();
  await expect(page.getByRole('button', { name: '版本列表', exact: true })).toBeVisible();
  const table = page.getByRole('table', { name: '版本列表' });
  await page.getByRole('button', { name: '新建草稿' }).click();
  await page.getByLabel('版本名称').fill('秋季版');
  await page.getByRole('button', { name: '创建并编辑' }).click();
  const formId = new URL(page.url()).searchParams.get('form');
  await expect(page.getByRole('heading', { name: '秋季版' })).toBeVisible();
  const work = new URL(page.url()).searchParams.get('work');
  await expect(page.getByRole('button', { name: '发布记录', exact: true })).toHaveCount(0);
  const more = page.getByRole('button', { name: '更多操作' });
  const actions = ['更多操作', '检查配置', '预览配置', '保存配置'];
  const sizes = await Promise.all(
    actions.map(async (name) => {
      const bounds = await page.getByRole('button', { name, exact: true }).boundingBox();
      return [bounds?.width, bounds?.height];
    }),
  );
  for (const size of sizes) expect(size).toEqual(sizes[0]);
  await more.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Agent 协作' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(more).toBeFocused();
  const snapshotIds: string[] = [];
  const config = (name: string) =>
    JSON.stringify({
      protocolVersion: '1',
      id: 'sample',
      version: '1',
      data: { schema: { type: 'object' } },
      views: { main: { material: 'section', props: { title: name } } },
    });
  for (const title of ['初稿', '定稿']) {
    if (!(await page.getByRole('textbox', { name: '配置原文', exact: true }).isVisible())) {
      await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
      await page.getByRole('button', { name: '文本查看 / 修复', exact: true }).click();
    }
    await page.getByLabel('配置原文', { exact: true }).fill(config(title));
    const response = page.waitForResponse(
      (r) => r.url().endsWith('/versions') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '保存配置', exact: true }).click();
    const r = await response;
    expect(r.status()).toBe(201);
    snapshotIds.push((await r.json()).versionId);
  }
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByText('当前配置已保存，无需重复保存')).toBeVisible();
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await expect(table.getByRole('columnheader')).toHaveText([
    '版本名称',
    '状态',
    '最近更新',
    '操作',
  ]);

  await expect(page.getByRole('table', { name: '版本列表' }).locator('tbody tr')).toHaveCount(1);
  await chooseWorkingVersionAction(page, '保存历史');
  const history = page.getByRole('dialog', { name: '保存历史' });
  await expect(history.getByRole('button', { name: '查看快照' })).toHaveCount(2);
  await history.getByRole('button', { name: '查看快照' }).last().click();
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await page.getByRole('button', { name: '格式化文本', exact: true }).click();
  await expect(page.getByLabel('配置原文', { exact: true })).toHaveValue(/初稿/);
  await expect(page.getByLabel('配置原文', { exact: true })).not.toBeEditable();
  await page.getByRole('button', { name: '返回保存历史' }).click();
  await expect(history.getByRole('button', { name: '查看快照' }).last()).toBeFocused();
  await history.getByRole('button', { name: '关闭', exact: true }).click();
  await chooseWorkingVersionAction(page, '发布');
  await page.getByRole('button', { name: '确认发布' }).click();
  const row = page
    .getByRole('table', { name: '版本列表' })
    .locator('tbody tr')
    .filter({ hasText: '秋季版' });
  await expect(row.getByText(/已发布/)).toBeVisible();
  const rejected = await page.request.post('/api/platform/forms/' + formId + '/versions', {
    headers: { Origin: origin, 'Idempotency-Key': crypto.randomUUID() },
    data: { workId: work, text: config('错误覆盖'), basedOnVersionId: snapshotIds[1] },
  });
  expect(rejected.status()).toBe(409);
  await chooseWorkingVersionAction(page, '查看配置', row);
  await expect(page.getByRole('navigation', { name: '数据模型大纲' })).toBeVisible();
  await page.getByRole('button', { name: '布局', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '视图大纲' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建布局' })).toHaveCount(0);
  await page.setViewportSize({ width: 760, height: 800 });
  const panes = page.getByRole('group', { name: '布局工作区' });
  await page.getByRole('navigation', { name: '视图大纲' }).getByRole('button').first().click();
  const inspector = page.getByRole('dialog');
  await expect(inspector.getByRole('region', { name: '节点设置' })).toBeVisible();
  await inspector.getByRole('button', { name: '关闭', exact: true }).click();
  await panes.getByRole('button', { name: '画布' }).click();
  await panes.getByRole('button', { name: '大纲' }).click();
  await expect(page.getByRole('navigation', { name: '视图大纲' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: '联动', exact: true }).click();
  await expect(page.getByText('尚未配置联动规则。')).toBeVisible();
  await page.getByRole('button', { name: '校验', exact: true }).click();
  await expect(page.getByText('尚未配置校验规则。')).toBeVisible();
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await page.getByRole('button', { name: '格式化文本', exact: true }).click();
  await expect(page.getByLabel('配置原文', { exact: true })).toHaveValue(/定稿/);
  await expect(page.getByRole('button', { name: '保存配置' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await chooseWorkingVersionAction(page, '基于此版创建新版', row);
  await page.getByLabel('版本名称').fill('冬季版');
  await page.getByRole('button', { name: '创建并编辑' }).click();
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await page.getByRole('button', { name: '文本查看 / 修复' }).click();
  await expect(page.getByLabel('配置原文', { exact: true })).toHaveValue(/定稿/);
  await page.getByLabel('配置原文', { exact: true }).fill(config('冬季独立修改'));
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await expect(page.getByRole('table', { name: '版本列表' }).locator('tbody tr')).toHaveCount(2);
  await page.reload();
  await expect(page.getByRole('table', { name: '版本列表' }).locator('tbody tr')).toHaveCount(2);
  await page.getByRole('button', { name: '发布记录', exact: true }).click();
  const releases = page.getByRole('table', { name: '发布记录列表' });
  await releases.getByRole('link', { name: '秋季版' }).click();
  await expect(page.getByRole('heading', { name: '秋季版' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '表单版本视图' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回发布记录', exact: true }).click();
  await expect(releases.getByRole('link', { name: '秋季版' })).toBeFocused();
});

test('empty creation, draft reload, and historical version and release links stay exact', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL!;
  const headers = { Origin: origin, 'Idempotency-Key': crypto.randomUUID() };
  expect(
    (
      await page.request.post('/api/platform/login', {
        headers,
        data: { username: 'studio-test', password: 'local-browser-test-password' },
      })
    ).ok(),
  ).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: '新建表单', exact: true }).click();
  await expect(page.getByRole('combobox', { name: '创建方式' })).toHaveCount(0);
  await page.getByLabel('表单名称').fill('空白表单验收');
  await page.getByRole('button', { name: '创建表单', exact: true }).click();
  await expect(page.getByRole('button', { name: '版本列表', exact: true })).toBeVisible();
  const formId = new URL(page.url()).searchParams.get('form');
  const path = '/api/platform/forms/' + formId;
  expect(await (await page.request.get(path + '/work')).json()).toEqual([]);
  const draft = await page.request.post(path + '/work', {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: '初始版本', text: JSON.stringify(basicInformationDefinition) },
  });
  expect(draft.ok()).toBeTruthy();
  await page.reload();
  await expect(page.getByText('初始版本', { exact: true })).toBeVisible();
  expect(await (await page.request.get(path + '/versions')).json()).toEqual([]);
  await chooseWorkingVersionAction(page, '编辑配置');
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await page.getByRole('button', { name: '文本查看 / 修复' }).click();
  const text = await page.getByLabel('配置原文', { exact: true }).inputValue();
  expect(JSON.parse(text).id).toBe('basic-information');
  const saved = await page.request.post(path + '/versions', {
    headers,
    data: { text: JSON.stringify(JSON.parse(text)), name: '历史快照', basedOnVersionId: null },
  });
  expect(saved.ok()).toBeTruthy();
  const { versionId } = await saved.json();
  const published = await page.request.post(path + '/releases', {
    headers,
    data: { versionId, name: '历史发布' },
  });
  expect(published.ok()).toBeTruthy();
  const { releaseId } = await published.json();
  await page.goto('/?form=' + formId + '&tab=history&version=' + versionId);
  await expect(page.getByRole('heading', { name: '历史快照' })).toBeVisible();
  await expect(page.getByRole('button', { name: '保存配置' })).toHaveCount(0);
  await page.goto('/?form=' + formId + '&tab=releases&release=' + releaseId);
  await expect(page.getByRole('link', { name: '在示例 Host 中打开' })).toHaveAttribute(
    'href',
    '/host?releaseId=' + releaseId,
  );
});

test('narrow form and version lists restore their filter, scroll and focused row', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 375, height: 700 });
  const origin = baseURL!;
  async function post(path: string, data: object) {
    const r = await page.request.post('/api/platform' + path, {
      headers: { Origin: origin, 'Idempotency-Key': crypto.randomUUID() },
      data,
    });
    expect(r.ok()).toBeTruthy();
    return r.json();
  }
  await post('/login', { username: 'studio-test', password: 'local-browser-test-password' });
  const name = '列表定位-00';
  const { formId } = await post('/forms', { name });
  for (let i = 1; i <= 14; i++)
    await post('/forms', { name: '列表定位-' + String(i).padStart(2, '0') });
  for (let i = 0; i < 16; i++)
    await post('/forms/' + formId + '/work', { name: '草稿批次 ' + i, text: '{}' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '表单列表' })).toHaveCSS('font-size', '24px');
  await expect(page.getByRole('button', { name: '新建表单' })).toHaveCSS('min-height', '36px');
  const forms = page.getByRole('searchbox').first();
  await forms.fill('列表定位');
  await forms.press('Enter');
  const open = page.getByRole('button', { name: '打开 ' + name, exact: true });
  await open.scrollIntoViewIfNeeded();
  const formTop = await page.evaluate(() => scrollY);
  const results = page.getByRole('region', { name: '表单结果' });
  const formLeft = await results.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
    return node.scrollLeft;
  });
  expect(formLeft).toBeGreaterThan(0);
  await open.evaluate((button) => button.focus({ preventScroll: true }));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '版本列表', exact: true })).toBeVisible();
  const search = page.getByRole('searchbox', { name: '搜索版本' });
  await search.fill('草稿批次');
  await search.press('Enter');
  const lastVersion = page.getByRole('table', { name: '版本列表' }).locator('tbody tr').last();
  const edit = workingVersionName(lastVersion);
  await edit.scrollIntoViewIfNeeded();
  const versionResults = page.getByRole('region', { name: '版本列表' });
  const top = await versionResults.evaluate((node) => node.scrollTop);
  expect(top).toBeGreaterThan(0);
  const rowPosition = await edit.evaluate((node) => {
    const { x, y, width, height } = node.getBoundingClientRect();
    const hit = document.elementFromPoint(x + width / 2, y + height / 2);
    return {
      top: y,
      hit: hit?.className,
      clickable: node.contains(hit),
      regions: [
        ...document.querySelectorAll(
          '.studio-version-workspace, .studio-table-layout-panel, .studio-table-results, .studio-table-layout-footer',
        ),
      ].map((region) => ({
        name: region.className,
        y: region.getBoundingClientRect().top,
        height: region.getBoundingClientRect().height,
      })),
    };
  });
  expect(rowPosition.clickable, JSON.stringify(rowPosition)).toBe(true);
  await chooseWorkingVersionAction(page, '编辑配置', lastVersion);
  await expect(page.getByRole('button', { name: '保存配置', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goBack();
  await expect(edit).toBeFocused();
  await expect(search).toHaveValue('草稿批次');
  await expect.poll(() => versionResults.evaluate((node) => node.scrollTop)).toBeCloseTo(top, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await expect(open).toBeFocused();
  await expect(forms).toHaveValue('列表定位');
  await expect.poll(() => results.evaluate((node) => node.scrollLeft)).toBe(formLeft);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(formTop, 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('sample preserves a failed save and supports keyboard selection inside the release dialog', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL!;
  async function post(path: string, data: object) {
    const response = await page.request.post('/api/platform' + path, {
      headers: { Origin: origin, 'Idempotency-Key': crypto.randomUUID() },
      data,
    });
    expect(response.ok()).toBeTruthy();
    return response.json();
  }
  await post('/login', { username: 'studio-test', password: 'local-browser-test-password' });
  const name = 'Studio UI 样板';
  const { formId } = await post('/forms', { name });
  await post('/forms/' + formId + '/work', { name: '首版', text: '{}' });
  await page.goto('/');
  await page.getByRole('button', { name: '打开 ' + name }).click();
  await chooseWorkingVersionAction(page, '编辑配置');
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await page.getByRole('button', { name: '文本查看 / 修复', exact: true }).click();
  const editor = page.getByRole('textbox', { name: '配置原文', exact: true });
  await editor.fill(
    JSON.stringify({
      protocolVersion: '1',
      id: 'sample',
      version: '1',
      data: { schema: { type: 'object' } },
      views: {
        main: { material: 'section', props: { title: '保留编辑内容' } },
        review: { material: 'section' },
      },
    }),
  );
  const edited = await editor.inputValue();
  const versionsUrl = '**/api/platform/forms/*/versions';
  await page.route(versionsUrl, (route) => route.fulfill({ status: 503 }), { times: 1 });
  const failed = page.waitForRequest((r) => r.url().endsWith('/versions') && r.method() === 'POST');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  const original = await failed;
  await expect(page.getByText('服务暂时无法完成操作，请重试。')).toBeVisible();
  await expect(editor).toHaveValue(edited);
  const retry = page.waitForResponse(
    (r) => r.url().endsWith('/versions') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '重试本次保存' }).click();
  const saved = await retry;
  expect(saved.status()).toBe(201);
  expect(saved.request().headers()['idempotency-key']).toBe(original.headers()['idempotency-key']);
  expect(saved.request().postDataJSON()).toEqual(original.postDataJSON());
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回版本列表' }).click();

  const publish = workingVersionMenu(page);
  await chooseWorkingVersionAction(page, '发布');
  const dialog = page.getByRole('dialog', { name: '发布版本' });
  const view = dialog.getByRole('combobox', { name: 'Web 视图' });
  await expect(dialog.getByRole('button', { name: '确认发布' })).toBeDisabled();
  await view.focus();
  await page.keyboard.press('ArrowDown');
  await expect(dialog.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog.getByRole('listbox')).toBeHidden();
  await expect(view).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(publish).toBeFocused();
  await chooseWorkingVersionAction(page, '发布');
  await view.focus();
  await page.keyboard.press('ArrowDown');
  const options = dialog.getByRole('listbox');
  await expect(options.locator('[role=option]:focus')).toBeVisible();
  await page.keyboard.press('End');
  await expect(options.getByRole('option', { name: 'review' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(view).toContainText('review');
  await expect(dialog.getByRole('button', { name: '确认发布' })).toBeEnabled();
});

// Resize a desktop Chromium window to the Studio shell's compact-layout breakpoint.
const narrowDesktopWidth = 640;

for (const width of [1440, narrowDesktopWidth]) {
  test(`Studio field spacing at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 850 });
    async function post(path: string, data: object) {
      const response = await page.request.post('/api/platform' + path, {
        headers: { Origin: baseURL!, 'Idempotency-Key': crypto.randomUUID() },
        data,
      });
      expect(response.ok()).toBeTruthy();
      return response.json();
    }
    await post('/login', { username: 'studio-test', password: 'local-browser-test-password' });
    const { formId } = await post('/forms', { name: '间距验收' });
    const text = JSON.stringify({
      protocolVersion: '1',
      id: 'spacing',
      version: '1',
      data: { schema: { type: 'object' } },
      views: { main: { material: 'section' } },
    });
    const { id: workId } = await post('/forms/' + formId + '/work', { name: '首版', text });
    await post('/forms/' + formId + '/versions', { workId, text, basedOnVersionId: null });
    await page.goto('/?form=' + formId);
    await chooseWorkingVersionAction(page, '发布');
    const dialog = page.getByRole('dialog', { name: '发布版本' });
    const name = dialog.getByRole('textbox', { name: '发布名称' });
    const select = dialog.getByRole('combobox', { name: 'Web 视图' });
    await expect(name).toHaveValue('首版');
    await expect(select).toBeVisible();

    const errorText = '发布检查发现配置需要重新核对。请保留当前输入并检查待发布版本。'.repeat(8);
    await page.route(
      '**/api/platform/forms/*/releases',
      (route) => route.fulfill({ json: { success: false, diagnostics: [{ message: errorText }] } }),
      { times: 1 },
    );
    await dialog.getByRole('button', { name: '确认发布' }).click();
    const error = dialog.getByRole('alert');
    await expect(error).toHaveText(errorText);
    const label = dialog.locator('.studio-field > label').first();
    await label.evaluate((element) => {
      element.textContent = '用于区分不同环境和审批流程的发布名称'.repeat(10);
    });
    const bounds = (await dialog.boundingBox())!;
    const labelBox = (await label.boundingBox())!;
    const inputBox = (await dialog.getByRole('textbox').boundingBox())!;
    const selectLabel = (await dialog.locator('.studio-field > label').nth(1).boundingBox())!;
    const errorBox = (await error.boundingBox())!;
    const actions = (await dialog.locator('.studio-modal-actions button').first().boundingBox())!;
    expect(labelBox.height).toBeGreaterThan(20);
    expect(inputBox.y - labelBox.y - labelBox.height).toBeCloseTo(8, 0);
    expect(selectLabel.y - inputBox.y - inputBox.height).toBeCloseTo(16, 0);
    expect((await select.boundingBox())!.y - selectLabel.y - selectLabel.height).toBeCloseTo(8, 0);
    expect(errorBox.height).toBeGreaterThan(44);
    expect(actions.y - errorBox.y - errorBox.height).toBeCloseTo(24, 0);
    expect(labelBox.x - bounds.x - 1).toBeCloseTo(width === narrowDesktopWidth ? 16 : 24, 0);
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await dialog.getByRole('button', { name: '关闭' }).click();

    await chooseWorkingVersionAction(page, '编辑配置');
    await page.getByRole('button', { name: '更多操作' }).click();
    await page.getByRole('menuitem', { name: '保存备注' }).click();
    const panel = page.locator('dialog[open] [data-density="dense"]');
    const note = panel.getByRole('textbox', { name: '保存备注（选填）' });
    await expect(note).toBeVisible();
    const noteLabel = panel.locator('.studio-field > label');
    await noteLabel.evaluate((element) => {
      element.textContent = '保存时提供可供后续版本审阅使用的补充说明'.repeat(6);
    });
    const noteLabelBox = (await noteLabel.boundingBox())!;
    const noteBox = (await panel.getByRole('textbox').boundingBox())!;
    const versionBox = (await panel.locator('.version').boundingBox())!;
    expect(noteLabelBox.height).toBeGreaterThan(20);
    expect(noteBox.y - noteLabelBox.y - noteLabelBox.height).toBeCloseTo(8, 0);
    expect(versionBox.y - noteBox.y - noteBox.height).toBeCloseTo(12, 0);
    const panelBox = (await panel.boundingBox())!;
    expect(panelBox.x).toBeGreaterThanOrEqual(0);
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(width);
    expect(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  });
}

for (const width of [1440, narrowDesktopWidth]) {
  test(`Studio layout sample at ${width}px`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width, height: 600 });
    async function post(path: string, data: object) {
      const response = await page.request.post('/api/platform' + path, {
        headers: { Origin: baseURL!, 'Idempotency-Key': crypto.randomUUID() },
        data,
      });
      expect(response.ok()).toBeTruthy();
      return response.json();
    }
    await post('/login', { username: 'studio-test', password: 'local-browser-test-password' });
    const name = '宽度验收表单 ' + width;
    const { formId } = await post('/forms', { name });
    const { id: workId } = await post('/forms/' + formId + '/work', { name: '版次', text: '{}' });
    let head: string | null = null;
    for (const value of ['a', 'b']) {
      const text = JSON.stringify({
        protocolVersion: '1',
        id: 'sample',
        version: '1',
        data: { schema: { type: 'object' } },
        views: { main: { material: 'section', props: { title: value.repeat(200) } } },
      });
      const saved = await post('/forms/' + formId + '/versions', {
        workId,
        text,
        basedOnVersionId: head,
      });
      head = saved.versionId;
    }
    await page.goto('/');
    const main = page.getByRole('main');
    await expect(main).toHaveCSS('max-width', 'none');
    await expect(main).toHaveCSS('padding-left', width === narrowDesktopWidth ? '16px' : '24px');
    await expect(
      page.locator('.studio-navigation').getByRole('button', { name: '表单', exact: true }),
    ).toHaveCSS('height', '44px');
    const filters = page.getByRole('search', { name: '表单筛选' });
    const results = page.getByRole('region', { name: '表单结果' });
    const count = page.getByRole('navigation', { name: '分页' }).getByRole('status');
    const search = filters.getByRole('searchbox');
    await search.fill('没有命中的关键词');
    await expect(results.getByRole('columnheader', { name: '表单', exact: true })).toBeVisible();
    await filters.getByRole('button', { name: '确认', exact: true }).click();
    await expect(page.getByText('没有匹配的表单，请更换关键词。')).toBeVisible();
    await filters.getByRole('button', { name: '重置' }).click();
    await expect(search).toHaveValue('');
    await expect(results.getByRole('columnheader', { name: '表单', exact: true })).toBeVisible();
    if (width > narrowDesktopWidth) {
      await results.getByRole('table').evaluate((table) => {
        table.style.minWidth = '1600px';
      });
    }
    const start = await Promise.all([filters.boundingBox(), count.boundingBox()]);
    const positions = await results.evaluate((node) => {
      const th = node.querySelector('th')!;
      const td = node.querySelector('td')!;
      const x = [th.getBoundingClientRect().x, td.getBoundingClientRect().x];
      node.scrollLeft = node.scrollWidth;
      return {
        offset: node.scrollLeft,
        dx: [x[0] - th.getBoundingClientRect().x, x[1] - td.getBoundingClientRect().x],
        root: document.documentElement.scrollWidth,
      };
    });
    expect(positions.offset).toBeGreaterThan(0);
    expect(positions.dx).toEqual([positions.offset, positions.offset]);
    expect(positions.root).toBe(width);
    expect(await Promise.all([filters.boundingBox(), count.boundingBox()])).toEqual(start);

    await search.fill(name);
    await search.press('Enter');
    await results.getByRole('button', { name: `打开 ${name}`, exact: true }).click();
    await chooseWorkingVersionAction(page, '发布');
    const release = page.getByRole('dialog', { name: '发布版本' });
    expect((await release.boundingBox())!.width).toBe(560);
    const releaseBody = release.locator('.studio-modal-body');
    const controls = release.getByRole('combobox', { name: 'Web 视图' });
    expect((await controls.boundingBox())!.y).toBeGreaterThan(
      (await release.getByRole('textbox', { name: '发布名称' }).boundingBox())!.y,
    );
    const confirm = release.getByRole('button', { name: '确认发布' });
    const footer = (await confirm.boundingBox())!;
    await releaseBody.evaluate((body) => {
      const content = body.firstElementChild as HTMLElement;
      content.style.minHeight = '1000px';
    });
    expect(await releaseBody.evaluate((body) => body.scrollHeight > body.clientHeight)).toBe(true);
    expect((await confirm.boundingBox())!.y + footer.height).toBeLessThanOrEqual(600);
    const pinned = await confirm.boundingBox();
    const bodyScroll = await releaseBody.evaluate((body) => {
      body.scrollTop = body.scrollHeight;
      return body.scrollTop;
    });
    expect(bodyScroll).toBeGreaterThan(0);
    expect(await confirm.boundingBox()).toEqual(pinned);
    await release.getByRole('button', { name: '关闭' }).click();

    await chooseWorkingVersionAction(page, '保存历史');
    await page.getByRole('button', { name: '对比快照' }).click();
    const diff = page.getByRole('dialog', { name: '配置对比' });
    expect((await diff.boundingBox())!.width).toBe(Math.min(880, width - 32));
    await diff.getByText('完整文本对比', { exact: true }).click();
    const pair = diff
      .locator('details[open]')
      .filter({ has: page.getByText('完整文本对比', { exact: true }) });
    const baseline = (await pair.getByText('基准', { exact: true }).boundingBox())!;
    const current = (await pair.getByText('当前', { exact: true }).boundingBox())!;
    if (width === narrowDesktopWidth) {
      expect(current.x).toBeCloseTo(baseline.x, 0);
      expect(current.y).toBeGreaterThan(baseline.y);
    } else {
      expect(current.y).toBeCloseTo(baseline.y, 0);
      expect(current.x).toBeGreaterThan(baseline.x + 320);
    }
    expect(await diff.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    await expect(diff.getByRole('button', { name: '返回' })).toBeInViewport();
  });
}
