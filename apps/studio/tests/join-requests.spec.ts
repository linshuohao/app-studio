import { expect, test } from '@playwright/test';
import { registerGitHubAccount } from './admission-fixture';

test('applies, withdraws, resolves a stale decision, reapplies after rejection and enters the team without signing in again', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(60000);
  await page.goto('/');
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
  await page.getByRole('button', { name: '成员', exact: true }).click();
  await expect(page.getByRole('button', { name: '添加成员', exact: true })).toHaveCount(0);
  await page.getByRole('tab', { name: '加入申请', exact: true }).click();
  const context = await browser.newContext({ baseURL });
  try {
    const member = await context.newPage();
    await member.route('https://github.com/login/oauth/authorize?*', async (route) => {
      const authorize = new URL(route.request().url());
      const callback = new URL(authorize.searchParams.get('redirect_uri')!);
      callback.searchParams.set('state', authorize.searchParams.get('state')!);
      callback.searchParams.set('code', 'studio-approval-code');
      await route.fulfill({ status: 302, headers: { Location: callback.href } });
    });
    await member.goto('/');
    await member.getByRole('button', { name: '用 GitHub 登录' }).click();
    await member.getByRole('button', { name: '确认创建账号' }).click();
    await member.getByLabel('申请说明').fill('希望参与表单配置与发布');
    await member.getByRole('button', { name: '申请加入团队', exact: true }).click();
    await expect(member.getByRole('heading', { name: '加入申请：待审批' })).toBeVisible();
    const first = (await (await member.request.get('/api/platform/join-requests/mine')).json())
      .request;
    await page.getByRole('button', { name: '刷新申请列表', exact: true }).click();
    await page
      .getByRole('button', { name: '审批申请 @approval-studio-member', exact: true })
      .click();
    await expect(page.getByRole('button', { name: '批准并授予角色' })).toBeDisabled();
    await page.getByRole('radio', { name: '拒绝', exact: true }).check();
    await page.getByLabel('拒绝原因').fill('请补充所属项目');
    await member.getByRole('button', { name: '撤回申请', exact: true }).click();
    await expect(member.getByRole('heading', { name: '加入申请：已撤回' })).toBeVisible();
    await page.getByRole('button', { name: '确认拒绝', exact: true }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('申请状态已变化');
    await expect(page.getByLabel('拒绝原因')).toHaveValue('请补充所属项目');
    await page.getByRole('button', { name: '读取最新申请状态' }).click();
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('已撤回');
    await expect(page.getByRole('button', { name: '确认拒绝', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: '关闭', exact: true }).click();
    await member.getByLabel('申请说明').fill('申请参与项目');
    await member.getByRole('button', { name: '重新申请加入团队' }).click();
    await expect(member.getByRole('heading', { name: '加入申请：待审批' })).toBeVisible();
    const second = (await (await member.request.get('/api/platform/join-requests/mine')).json())
      .request;
    expect(second.requestId).not.toBe(first.requestId);
    await page.getByRole('button', { name: '刷新申请列表', exact: true }).click();
    await page
      .getByRole('button', { name: '审批申请 @approval-studio-member', exact: true })
      .click();
    await page.getByRole('radio', { name: '拒绝', exact: true }).check();
    await expect(page.getByRole('button', { name: '确认拒绝', exact: true })).toBeDisabled();
    await page.getByLabel('拒绝原因').fill('请补充项目名称');
    await page.getByRole('button', { name: '确认拒绝', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await member.getByRole('button', { name: '刷新团队状态' }).click();
    await expect(member.getByText('拒绝原因：请补充项目名称')).toBeVisible();
    await member.getByLabel('申请说明').fill('参与出行投保项目的配置与发布');
    await member.getByRole('button', { name: '重新申请加入团队' }).click();
    await expect(member.getByRole('heading', { name: '加入申请：待审批' })).toBeVisible();
    const third = (await (await member.request.get('/api/platform/join-requests/mine')).json())
      .request;
    expect(third.requestId).not.toBe(second.requestId);
    await page.getByRole('button', { name: '刷新申请列表', exact: true }).click();
    await page
      .getByRole('button', { name: '审批申请 @approval-studio-member', exact: true })
      .click();
    await page.getByRole('combobox', { name: '授予角色' }).click();
    await page.getByRole('option', { name: '编辑＋发布', exact: true }).click();
    // A committed response lost in transit must be recovered through exact request status.
    await page.route(
      '**/api/platform/join-requests/*/decision',
      async (route) => {
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort();
      },
      { times: 1 },
    );
    await page.getByRole('button', { name: '批准并授予角色' }).click();
    await expect(page.getByText('已确认申请处理结果：已批准。')).toBeVisible();
    await member.getByRole('button', { name: '刷新团队状态' }).click();
    await expect(member.getByRole('heading', { name: '表单列表' })).toBeVisible();
    await expect(member.getByRole('button', { name: '新建表单', exact: true })).toBeVisible();
    const access = await (await member.request.get('/api/platform/access')).json();
    expect(access.permissions).toEqual(expect.arrayContaining(['form:edit', 'form:publish']));
    expect(access.permissions).not.toContain('member:manage');
    await page.getByRole('tab', { name: '成员', exact: true }).click();
    await page
      .getByRole('button', { name: '编辑成员 @approval-studio-member', exact: true })
      .click();
    await page.getByLabel('启用成员访问').uncheck();
    await page.getByRole('button', { name: '确认停用' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await member.reload();
    await expect(member.getByRole('heading', { name: '团队成员资格已停用' })).toBeVisible();
    await expect(member.getByRole('button', { name: '申请加入团队', exact: true })).toHaveCount(0);
    await expect(member.getByRole('button', { name: '重新申请加入团队' })).toHaveCount(0);
    expect(
      (
        await member.request.post('/api/platform/join-requests', {
          headers: { Origin: new URL(baseURL!).origin },
          data: { explanation: '试图重新申请' },
        })
      ).status(),
    ).toBe(409);
  } finally {
    await context.close();
  }
});

test('clears only the list failure after successfully refreshing join requests', async ({
  page,
}) => {
  await page.goto('/');
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
  await page.getByRole('button', { name: '成员', exact: true }).click();
  const listRoute = '**/api/platform/join-requests?*';
  await page.route(listRoute, (route) => route.abort());
  await page.getByRole('tab', { name: '加入申请', exact: true }).click();
  await expect(page.getByText('无法连接到服务，请重试。', { exact: true })).toBeVisible();
  await page.unroute(listRoute);
  const loaded = page.waitForResponse(
    (response) =>
      response.url().includes('/api/platform/join-requests?') && response.status() === 200,
  );
  await page.getByRole('button', { name: '刷新申请列表', exact: true }).click();
  await loaded;
  await expect(page.getByRole('navigation', { name: '分页' }).getByRole('status')).toBeVisible();
  await expect(page.getByText('无法连接到服务，请重试。', { exact: true })).toHaveCount(0);
});

for (const replacement of ['different', 'same'] as const) {
  test(`ignores an old application 401 after logout and ${replacement} account sign-in`, async ({
    page,
    baseURL,
  }) => {
    const origin = new URL(baseURL!).origin;
    const code = replacement === 'same' ? 'studio-stale-same-code' : 'studio-stale-code';
    const previous = await registerGitHubAccount(page.request, origin, code);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '尚未加入团队' })).toBeVisible();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const pending = new Promise<void>((resolve) => {
      started = resolve;
    });
    await page.route(
      '**/api/platform/join-requests',
      async (route) => {
        started();
        await gate;
        await route.fulfill({ status: 401, json: { message: 'Expired old session' } });
      },
      { times: 1 },
    );
    await page.getByLabel('申请说明').fill('在旧会话提交的申请');
    await page.getByRole('button', { name: '申请加入团队', exact: true }).click();
    await pending;
    await page.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '登录表单工作台' })).toBeVisible();
    if (replacement === 'different') {
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
    } else {
      await page.route('https://github.com/login/oauth/authorize?*', async (route) => {
        const authorize = new URL(route.request().url());
        const callback = new URL(authorize.searchParams.get('redirect_uri')!);
        callback.searchParams.set('state', authorize.searchParams.get('state')!);
        callback.searchParams.set('code', code);
        await route.fulfill({ status: 302, headers: { Location: callback.href } });
      });
      await page.getByRole('button', { name: '用 GitHub 登录' }).click();
      await expect(page.getByRole('heading', { name: '尚未加入团队' })).toBeVisible();
    }
    release();
    await page.unrouteAll({ behavior: 'wait' });
    await expect(
      page.getByRole('heading', { name: replacement === 'same' ? '尚未加入团队' : '表单列表' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '登录表单工作台' })).toHaveCount(0);
    const current = await (await page.request.get('/api/platform/account')).json();
    if (replacement === 'same') expect(current.userId).toBe(previous.userId);
    else expect(current.userId).not.toBe(previous.userId);
  });
}
