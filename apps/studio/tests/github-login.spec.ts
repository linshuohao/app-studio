import { expect, test } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';

test('binds, signs in, publishes and serves Host, then rejects a late callback after unlink and rebind', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const password = 'local-browser-test-password';
  let bindingCallback = '';
  await page.route('https://github.com/login/oauth/authorize?*', async (route) => {
    const authorize = new URL(route.request().url());
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    expect(callback.origin).toBe(origin);
    callback.searchParams.set('state', authorize.searchParams.get('state')!);
    callback.searchParams.set('code', 'studio-test-code');
    bindingCallback = callback.href;
    await route.fulfill({ status: 302, headers: { Location: callback.href } });
  });
  async function builtinLogin() {
    await expect(
      page
        .getByLabel('用户名', { exact: true })
        .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
    ).toBeVisible();
    if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
      await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
    await page.getByLabel('用户名').fill('studio-test');
    await page.getByLabel('密码', { exact: true }).fill(password);
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await page
      .locator('.studio-navigation')
      .getByRole('button', { name: '表单', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: '表单列表' })).toBeVisible();
  }
  async function bindingAction(name: string) {
    await page.getByRole('button', { name: '我的账号', exact: true }).click();
    await page.getByRole('menuitem', { name: '账号与权限', exact: true }).click();
    await page.getByText('GitHub 账号', { exact: true }).click();
    await page.getByLabel('确认内置密码').fill(password);
    await page.getByRole('button', { name, exact: true }).click();
  }
  await page.goto('/');
  await builtinLogin();
  const currentIdentity = async () => (await page.request.get('/api/platform/access')).json();
  const builtin = await currentIdentity();
  await bindingAction('绑定 GitHub');
  await expect(page.getByText('已绑定 GitHub 账号。')).toBeVisible();
  await page.goto(bindingCallback);
  await expect(page.getByText('GitHub 授权已失效，请重新发起。')).toBeVisible();
  await page.getByRole('button', { name: '我的账号', exact: true }).click();
  await page.getByRole('menuitem', { name: '账号与权限', exact: true }).click();
  await page.getByRole('button', { name: '退出登录' }).click();
  await page.getByRole('button', { name: '用 GitHub 登录' }).click();
  await expect(page.getByText('已使用 GitHub 登录。')).toBeVisible();
  expect(await currentIdentity()).toEqual(builtin);

  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('GitHub 登录发布');
  await page.getByRole('button', { name: '创建表单' }).click();
  await page.getByRole('button', { name: '文本查看 / 修复' }).click();
  await page.getByLabel('配置原文').fill(
    JSON.stringify({
      ...travelDefinition,
      views: { desktop: travelDefinition.views.desktop },
    }),
  );
  await page.getByRole('button', { name: '保存并发布' }).click();
  await page.getByRole('button', { name: '确认发布' }).click();
  await page.getByRole('button', { name: '查看发布记录' }).click();
  const link = page.getByRole('link', { name: '在示例 Host 中打开' });
  await expect(link).toHaveCount(1);
  const release = await link.getAttribute('href');

  const guest = await browser.newContext({ baseURL: origin });
  try {
    const host = await guest.newPage();
    await host.goto(release!);
    await expect(host.getByText('家庭短期出行投保录入单')).toBeVisible();
    const pending = await guest.request.post('/api/platform/github/login', {
      headers: { Origin: origin },
      data: {},
    });
    expect(pending.ok()).toBeTruthy();
    const authorize = new URL((await pending.json()).url);
    const late = new URL(authorize.searchParams.get('redirect_uri')!);
    late.searchParams.set('state', authorize.searchParams.get('state')!);
    late.searchParams.set('code', 'studio-test-code');

    await page.goto('/');
    await bindingAction('解绑 GitHub');
    await expect(page.getByRole('heading', { name: '登录表单工作台' })).toBeVisible();
    await builtinLogin();
    expect(await currentIdentity()).toEqual(builtin);
    await bindingAction('绑定 GitHub');
    await expect(page.getByText('已绑定 GitHub 账号。')).toBeVisible();

    await host.goto(late.href);
    await expect(host.getByText('GitHub 授权已失效，请重新发起。')).toBeVisible();
    expect((await guest.request.get('/api/platform/access')).status()).toBe(401);

    const next = await guest.request.post('/api/platform/github/login', {
      headers: { Origin: origin },
      data: {},
    });
    expect(next.ok()).toBeTruthy();
    const fresh = new URL((await next.json()).url);
    const callback = new URL(fresh.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', fresh.searchParams.get('state')!);
    callback.searchParams.set('code', 'studio-test-code');
    await host.route(
      '**/api/platform/github/callback?*',
      async (route) => {
        const response = await route.fetch({ maxRedirects: 0 });
        expect(response.headers().location).toBe('/?github=signed-in');
        const session = await guest.request.get('/api/platform/access');
        expect(session.status()).toBe(200);
        const logout = await guest.request.post('/api/platform/logout', {
          headers: { Origin: origin },
        });
        expect(logout.status()).toBe(204);
        await route.fulfill({ response });
      },
      { times: 1 },
    );
    await host.goto(callback.href);
    await expect(host.getByRole('heading', { name: '登录表单工作台' })).toBeVisible();
    await expect(host.getByText('已使用 GitHub 登录。')).toHaveCount(0);
    expect((await guest.request.get('/api/platform/access')).status()).toBe(401);
    await expect(
      host
        .getByLabel('用户名', { exact: true })
        .or(host.getByRole('button', { name: '使用账号密码登录', exact: true })),
    ).toBeVisible();
    if (await host.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
      await host.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
    await host.getByLabel('用户名').fill('studio-test');
    await host.getByLabel('密码', { exact: true }).fill(password);
    await host.getByRole('button', { name: '登录', exact: true }).click();
    await expect(host.getByRole('heading', { name: '表单列表' })).toBeVisible();
    await expect(host.getByText('已使用 GitHub 登录。')).toHaveCount(0);
  } finally {
    await guest.close();
  }
});
