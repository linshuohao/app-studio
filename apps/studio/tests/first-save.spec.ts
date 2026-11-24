import { displayJson } from '../src/app/format-json';
import { expect, type Page, test } from '@playwright/test';
import { schemaSource as textMode } from './data-schema-fixture';
import { workingVersionName } from './working-version-menu';

async function signIn(page: Page) {
  await page.goto('/');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码').fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '表单列表' })).toBeVisible();
}

test('creates a form, resolves an unknown save and reopens exact saved text', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('差旅申请');
  await page.getByRole('button', { name: '创建表单' }).click();

  await page.getByRole('button', { name: '新建草稿', exact: true }).click();
  await page.getByLabel('版本名称').fill('差旅配置');
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
  const editor = page.getByLabel('配置原文', { exact: true });
  const versionList = () =>
    page.request.get(
      '/api/platform/forms/' + new URL(page.url()).searchParams.get('form') + '/versions',
    );
  const save = page.getByRole('button', { name: '保存配置', exact: true });
  await textMode(page);
  await expect(editor).toHaveValue('{}\n');
  await expect(page.getByText('尚无配置版本')).toBeVisible();
  const invalidText = '{"中文":true}';
  const newerText = '{"用途":"差旅"}\n';
  await textMode(page);
  await editor.fill(invalidText);

  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstRequest = page.waitForRequest('**/api/platform/forms/*/versions');
  let originalVersionId: string | undefined;
  await page.route(
    '**/api/platform/forms/*/versions',
    async (route) => {
      await delayed;
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      originalVersionId = (await response.json()).versionId;
      await route.abort();
    },
    { times: 1 },
  );

  await save.click();
  const original = await firstRequest;
  await textMode(page);
  await editor.fill(newerText);
  release();
  await expect(page.getByText('保存结果待确认')).toBeVisible();
  await page.route('**/api/platform/forms/*/versions', (route) => route.fulfill({ status: 403 }), {
    times: 1,
  });
  await page.getByRole('button', { name: '重试本次保存' }).click();
  await textMode(page);
  await expect(editor).not.toBeEditable();
  await textMode(page);
  await expect(editor).toHaveValue(displayJson(newerText));
  await expect(page.getByText('只读配置', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '刷新访问权限' }).click();
  const retryRequest = page.waitForRequest('**/api/platform/forms/*/versions');
  await page.getByRole('button', { name: '重试本次保存' }).click();
  const retry = await retryRequest;
  expect(retry.headers()['idempotency-key']).toBe(original.headers()['idempotency-key']);
  expect(retry.postDataJSON()).toEqual(original.postDataJSON());
  await expect(page.getByText('有未保存的更改')).toBeVisible();
  expect(originalVersionId).toBeTruthy();
  expect(await (await versionList()).json()).toEqual([
    expect.objectContaining({ versionId: originalVersionId }),
  ]);
  await textMode(page);
  await expect(editor).toHaveValue(newerText);

  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await workingVersionName(page).click();
  await textMode(page);
  await expect(editor).toHaveValue(displayJson(invalidText));

  await textMode(page);
  await editor.fill(newerText);
  await save.click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  expect(await (await versionList()).json()).toHaveLength(2);
  await page.reload();
  await textMode(page);
  await expect(editor).toHaveValue(displayJson(newerText));
  const unsaved = '{"用途":"撤权前编辑"}';
  await textMode(page);
  await editor.fill(unsaved);
  await page.route('**/api/platform/account', async (route) => {
    const response = await route.fetch();
    const account = await response.json();
    await route.fulfill({
      response,
      json: { ...account, membership: { ...account.membership, permissions: ['form:view'] } },
    });
  });
  await page.route('**/api/platform/forms/*/versions', (route) => route.fulfill({ status: 403 }), {
    times: 1,
  });
  await save.click();
  await expect(page.getByText('当前账号没有操作权限。', { exact: true })).toBeVisible();
  await textMode(page);
  await expect(editor).toHaveValue(displayJson(unsaved));
  await textMode(page);
  await expect(editor).not.toBeEditable();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await expect(page.getByRole('button', { name: '创建表单' })).toHaveCount(0);
  await workingVersionName(page).click();
  await textMode(page);
  await expect(editor).not.toBeEditable();
  await textMode(page);
  await expect(editor).toHaveValue(displayJson(newerText));
  await page.unroute('**/api/platform/account');
  await page.reload();
  await textMode(page);
  await expect(editor).toBeEditable();
  let finishLogout!: () => void;
  const logoutDelayed = new Promise<void>((resolve) => {
    finishLogout = resolve;
  });
  await page.route(
    '**/api/platform/logout',
    async (route) => {
      await logoutDelayed;
      await route.continue();
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('menuitem', { name: '账号与权限', exact: true }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await expect(page.getByRole('button', { name: '退出登录' })).toBeDisabled();
  finishLogout();
  await expect(page.getByRole('heading', { name: '登录表单工作台' })).toBeVisible();
});

test('retries creation with its original key and keeps a confirmed form visible if opening fails', async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('创建回执');
  const formsUrl = '**/api/platform/forms';
  const initialRequest = page.waitForRequest(
    (request) => request.url().endsWith('/forms') && request.method() === 'POST',
  );
  await page.route(
    formsUrl,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort();
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: '创建表单' }).click();
  const first = await initialRequest;
  await page.route(formsUrl, (route) => route.fulfill({ status: 403 }), { times: 1 });
  await page.getByRole('button', { name: '重试创建' }).click();
  await expect(page.getByRole('button', { name: '刷新访问权限' })).toBeVisible();
  await page.getByRole('button', { name: '刷新访问权限' }).click();

  await page.route('**/api/platform/forms/*', (route) => route.abort(), { times: 1 });
  const replayRequest = page.waitForRequest(
    (request) => request.url().endsWith('/forms') && request.method() === 'POST',
  );
  await page.getByRole('button', { name: '重试创建' }).click();
  const replay = await replayRequest;
  expect(replay.headers()['idempotency-key']).toBe(first.headers()['idempotency-key']);
  expect(replay.postDataJSON()).toEqual(first.postDataJSON());
  await expect(page.getByText('无法连接到服务，请重试。', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '打开 创建回执' })).toHaveCount(1);
  await page.getByRole('button', { name: '打开 创建回执' }).click();
  await expect(page.getByRole('heading', { name: '创建回执' })).toBeVisible();
  await expect(page.getByRole('button', { name: '版本列表', exact: true })).toBeVisible();
  await expect(page.getByText('暂无版本。')).toBeVisible();
});

for (const delayedPhase of ['create', 'open']) {
  test(`late ${delayedPhase} response preserves newer browser navigation`, async ({ page }) => {
    await signIn(page);
    await page.getByRole('button', { name: '物料', exact: true }).click();
    await page
      .locator('.studio-navigation')
      .getByRole('button', { name: '表单', exact: true })
      .click();
    await page.getByRole('button', { name: '新建表单' }).click();
    const name = `导航保护 ${delayedPhase}`;
    await page.getByLabel('表单名称').fill(name);
    let unblock!: () => void;
    const gate = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let reached!: () => void;
    const pending = new Promise<void>((resolve) => {
      reached = resolve;
    });
    await page.route(
      delayedPhase === 'create' ? '**/api/platform/forms' : '**/api/platform/forms/*',
      async (route) => {
        const response = await route.fetch();
        reached();
        await gate;
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: '创建表单' }).click();
    await pending;
    await page.goBack();
    await expect(page).toHaveURL(/catalog=materials/);
    unblock();
    await expect(page.getByRole('navigation', { name: '分页' })).toContainText('第 1 / 3 页');
    await expect(page.locator('.material-card')).toHaveCount(6);
    await expect(
      page.locator('.studio-navigation').getByRole('button', { name: '表单', exact: true }),
    ).toBeEnabled();
    await page
      .locator('.studio-navigation')
      .getByRole('button', { name: '表单', exact: true })
      .click();
    await expect(page.getByRole('button', { name: `打开 ${name}`, exact: true })).toBeVisible();
  });
}
