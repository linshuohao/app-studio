import { expect, test, type Page } from '@playwright/test';

async function mockAuthorization(page: Page, code: string) {
  await page.route('https://github.com/login/oauth/authorize?*', async (route) => {
    const authorize = new URL(route.request().url());
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorize.searchParams.get('state')!);
    callback.searchParams.set('code', code);
    await route.fulfill({ status: 302, headers: { Location: callback.href } });
  });
}

test('confirms GitHub registration and keeps account access separate from team resources', async ({
  page,
}) => {
  await mockAuthorization(page, 'studio-registration-code');
  const resourceRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/platform\/(forms|catalog|members)(\/|\?|$)/.test(request.url()))
      resourceRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: '用 GitHub 登录' }).click();
  await expect(page.getByRole('heading', { name: '创建平台账号' })).toBeVisible();
  await expect(page.getByText('GitHub 身份已验证，请确认是否创建平台账号。')).toBeVisible();
  await expect(page.getByText('暂时无法完成 GitHub 授权，请重试。')).toHaveCount(0);
  await expect(page.getByText('@new-studio-member', { exact: true })).toBeVisible();
  expect((await page.request.get('/api/platform/account')).status()).toBe(401);
  await page.getByRole('button', { name: '确认创建账号' }).click();
  await expect(page.getByRole('heading', { name: '尚未加入团队' })).toBeVisible();
  const account = await (await page.request.get('/api/platform/account')).json();
  expect(account.membership.status).toBe('none');
  expect(account.hasPassword).toBe(false);
  await expect(
    page.locator('.studio-navigation').getByRole('button', { name: '表单', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('.studio-navigation').getByRole('button', { name: '成员', exact: true }),
  ).toHaveCount(0);
  await page.goto('/?catalog=materials&asset=remote-select');
  await expect(page.getByRole('heading', { name: '尚未加入团队' })).toBeVisible();
  expect(resourceRequests).toEqual([]);
  expect((await page.request.get('/api/platform/forms')).status()).toBe(403);
  expect((await page.request.get('/api/platform/catalog/materials')).status()).toBe(403);
  await page.getByRole('button', { name: '账号设置', exact: true }).click();
  await expect(
    page.getByText('GitHub 是当前唯一登录方式，不能解绑。设置内置登录方式后才可解绑。'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '解绑 GitHub', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录 Assemble Studio' })).toBeVisible();
  expect((await page.request.get('/api/platform/account')).status()).toBe(401);
  await page.getByRole('button', { name: '用 GitHub 登录' }).click();
  await expect(page.getByRole('heading', { name: '尚未加入团队' })).toBeVisible();
  expect((await (await page.request.get('/api/platform/account')).json()).userId).toBe(
    account.userId,
  );
});

test('can leave registration for an existing account and invalidates its pending confirmation', async ({
  page,
  baseURL,
}) => {
  await mockAuthorization(page, 'studio-registration-cancel');
  await page.goto('/');
  await page.getByRole('button', { name: '用 GitHub 登录' }).click();
  await expect(page.getByRole('heading', { name: '创建平台账号' })).toBeVisible();
  await expect(page.getByText('GitHub 身份已验证，请确认是否创建平台账号。')).toBeVisible();
  await expect(page.getByText('暂时无法完成 GitHub 授权，请重试。')).toHaveCount(0);
  await page.getByRole('button', { name: '返回登录已有账号' }).click();
  await expect(page.getByRole('heading', { name: '登录 Assemble Studio' })).toBeVisible();
  expect(
    (
      await page.request.post('/api/platform/github/register', {
        headers: { Origin: new URL(baseURL!).origin },
        data: {},
      })
    ).status(),
  ).toBe(401);
  await page.reload();
  await expect(page.getByRole('heading', { name: '登录 Assemble Studio' })).toBeVisible();
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名', { exact: true }).fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '表单列表' })).toBeVisible();
});

test('ignores a team-list response that arrives after logout', async ({ page, baseURL }) => {
  await page.request.post('/api/platform/login', {
    headers: { Origin: new URL(baseURL!).origin },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let observed!: () => void;
  const held = new Promise<void>((resolve) => {
    observed = resolve;
  });
  await page.route(
    '**/api/platform/forms',
    async (route) => {
      const response = await route.fetch();
      observed();
      await gate;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.goto('/');
  await held;
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('menuitem', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录 Assemble Studio' })).toBeVisible();
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('heading', { name: '登录 Assemble Studio' })).toBeVisible();
  await expect(
    page.locator('.studio-navigation').getByRole('button', { name: '表单', exact: true }),
  ).toHaveCount(0);
});
