import { expect, test, type Page } from '@playwright/test';
import { registerGitHubAccount } from './admission-fixture';

async function authorizeAs(page: Page, getCode: () => string) {
  await page.route('https://github.com/login/oauth/authorize?*', async (route) => {
    const authorize = new URL(route.request().url());
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    const callback = new URL(authorize.searchParams.get('redirect_uri')!);
    callback.searchParams.set('state', authorize.searchParams.get('state')!);
    callback.searchParams.set('code', getCode());
    await route.fulfill({ status: 302, headers: { Location: callback.href } });
  });
}
async function setCredentials(page: Page, username: string) {
  await page.getByLabel('登录用户名', { exact: true }).fill(username);
  await page.getByLabel('设置密码', { exact: true }).fill('local-methods-password');
  await page.getByLabel('确认设置密码', { exact: true }).fill('local-methods-password');
  await page.getByRole('button', { name: '保存内置登录方式' }).click();
}

test('verifies GitHub before setup, preserves the current session, revokes other sessions and supports safe binding and unlinking', async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  const origin = new URL(baseURL!).origin;
  let code = 'studio-methods-code';
  await authorizeAs(page, () => code);
  await page.goto('/');
  await page.getByRole('button', { name: '用 GitHub 登录' }).click();
  await page.getByRole('button', { name: '确认创建账号' }).click();
  await expect(page.getByRole('heading', { name: '尚未加入团队' })).toBeVisible();
  const original = await (await page.request.get('/api/platform/account')).json();
  const other = await browser.newContext({ baseURL });
  const owner = await browser.newContext({ baseURL });
  try {
    const otherPage = await other.newPage();
    await authorizeAs(otherPage, () => 'studio-methods-code');
    await otherPage.goto('/');
    await otherPage.getByRole('button', { name: '用 GitHub 登录' }).click();
    await expect(otherPage.getByRole('heading', { name: '尚未加入团队' })).toBeVisible();
    const conflictOwner = await registerGitHubAccount(
      owner.request,
      origin,
      'studio-conflict-owner-code',
    );
    await page.getByRole('button', { name: '账号设置', exact: true }).click();
    await expect(page.getByRole('button', { name: '解绑 GitHub', exact: true })).toHaveCount(0);
    await expect(
      page.getByText('GitHub 是当前唯一登录方式，不能解绑。设置内置登录方式后才可解绑。'),
    ).toBeVisible();
    code = 'studio-conflict-owner-code';
    await page.getByRole('button', { name: '重新验证 GitHub 身份' }).click();
    await expect(
      page.getByText(
        'GitHub 身份与本次操作不匹配，或已绑定其他平台账号。不会自动合并账号，请返回原账号核对绑定。',
      ),
    ).toBeVisible();
    await expect(page.getByText('暂时无法完成 GitHub 授权，请重试。', { exact: true })).toHaveCount(
      0,
    );
    await expect(page.getByRole('button', { name: '保存内置登录方式' })).toHaveCount(0);
    expect((await (await page.request.get('/api/platform/account')).json()).userId).toBe(
      original.userId,
    );
    code = 'studio-methods-code';
    await page.getByRole('button', { name: '重新验证 GitHub 身份' }).click();
    await expect(page.getByRole('heading', { name: '账号与安全' })).toBeVisible();
    await expect(page.getByText('GitHub 身份已重新验证，请设置内置登录方式。')).toBeVisible();
    await expect(page.getByText('暂时无法完成 GitHub 授权，请重试。', { exact: true })).toHaveCount(
      0,
    );
    await setCredentials(page, 'studio-test');
    await expect(
      page.getByText('用户名已被占用，或登录方式已变化。请更换用户名后重试，账号不会自动合并。'),
    ).toBeVisible();
    await expect(page.getByLabel('登录用户名')).toHaveValue('studio-test');
    await page.route(
      '**/api/platform/account/password/setup',
      async (route) => {
        expect(route.request().method()).toBe('POST');
        const response = await route.fetch();
        expect(response.status()).toBe(200);
        await route.abort();
      },
      { times: 1 },
    );
    await setCredentials(page, 'studio-methods-user');
    await expect(page.getByText('内置登录方式已设置，其他会话已退出。')).toBeVisible();
    await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
    const configured = await (await page.request.get('/api/platform/account')).json();
    expect(configured.userId).toBe(original.userId);
    expect(configured.hasPassword).toBe(true);
    expect((await other.request.get(origin + '/api/platform/account')).status()).toBe(401);
    await page.getByLabel('确认内置密码').fill('local-methods-password');
    await page.getByRole('button', { name: '解绑 GitHub', exact: true }).click();
    await expect(page.getByRole('heading', { name: '登录表单工作台' })).toBeVisible();
    await expect(page.getByText('解绑成功，请使用内置账号重新登录。')).toBeVisible();
    await expect(
      page
        .getByLabel('用户名', { exact: true })
        .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
    ).toBeVisible();
    if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
      await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
    await page.getByLabel('用户名', { exact: true }).fill('studio-methods-user');
    await page.getByLabel('密码', { exact: true }).fill('local-methods-password');
    await page.getByRole('button', { name: '登录', exact: true }).click();
    await expect(page.getByRole('heading', { name: '账号与安全' })).toBeVisible();
    expect((await (await page.request.get('/api/platform/account')).json()).userId).toBe(
      original.userId,
    );
    code = 'studio-conflict-owner-code';
    await page.getByLabel('确认内置密码').fill('local-methods-password');
    await page.getByRole('button', { name: '绑定 GitHub', exact: true }).click();
    await expect(
      page.getByText(
        'GitHub 身份与本次操作不匹配，或已绑定其他平台账号。不会自动合并账号，请返回原账号核对绑定。',
      ),
    ).toBeVisible();
    expect((await (await page.request.get('/api/platform/account')).json()).githubLogin).toBeNull();
    expect((await (await owner.request.get(origin + '/api/platform/account')).json()).userId).toBe(
      conflictOwner.userId,
    );
    code = 'studio-methods-code';
    await page.getByLabel('确认内置密码').fill('local-methods-password');
    await page.getByRole('button', { name: '绑定 GitHub', exact: true }).click();
    await expect(page.getByText('已绑定 GitHub 账号。', { exact: true })).toBeVisible();
    await expect(page.getByText('暂时无法完成 GitHub 授权，请重试。', { exact: true })).toHaveCount(
      0,
    );
    await page.getByLabel('确认内置密码').fill('local-methods-password');
    await page.getByRole('button', { name: '解绑 GitHub', exact: true }).click();
    await expect(page.getByText('已解绑 GitHub 账号。', { exact: true })).toBeVisible();
    await expect(page.getByText('尚未绑定 GitHub 账号。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '安全记录', exact: true }).click();
    const records = page.getByRole('dialog', { name: '账号安全记录' });
    for (const action of ['绑定 GitHub', '解绑 GitHub']) {
      await records.getByRole('combobox', { name: '筛选动作' }).click();
      await page.getByRole('option', { name: action, exact: true }).click();
      await records.getByRole('button', { name: '确认', exact: true }).click();
      const entry = records.locator('.operation-item').first();
      await entry.locator('button.operation-line').click();
      await expect(entry.getByText(/记录 ID/)).toBeVisible();
    }
    await records.getByRole('button', { name: '关闭', exact: true }).click();
    expect((await page.request.get('/api/platform/account')).status()).toBe(200);
  } finally {
    await other.close();
    await owner.close();
  }
});

test('offers first password setup in account settings for an approved GitHub-only member', async ({
  page,
  browser,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const account = await registerGitHubAccount(page.request, origin, 'studio-member-methods-code');
  const pending = await page.request.post('/api/platform/join-requests', {
    headers: { Origin: origin },
    data: { explanation: '加入团队后设置内置登录' },
  });
  const request = await pending.json();
  const admin = await browser.newContext({ baseURL });
  try {
    await admin.request.post(origin + '/api/platform/login', {
      headers: { Origin: origin },
      data: { username: 'studio-test', password: 'local-browser-test-password' },
    });
    const decision = await admin.request.post(
      origin + `/api/platform/join-requests/${request.requestId}/decision`,
      {
        headers: { Origin: origin },
        data: { revision: request.revision, decision: 'approve', roles: ['viewer'] },
      },
    );
    expect(decision.status()).toBe(200);
    await authorizeAs(page, () => 'studio-member-methods-code');
    await page.goto('/?page=account');
    await expect(page.getByRole('heading', { name: '账号与权限' })).toBeVisible();
    await page.getByRole('button', { name: '重新验证 GitHub 身份' }).click();
    await expect(page.getByText('GitHub 身份已重新验证，请设置内置登录方式。')).toBeVisible();
    await expect(page.getByText('暂时无法完成 GitHub 授权，请重试。', { exact: true })).toHaveCount(
      0,
    );
    await setCredentials(page, 'studio-approved-methods');
    await expect(page.getByRole('heading', { name: '修改密码' })).toBeVisible();
    expect((await (await page.request.get('/api/platform/account')).json()).userId).toBe(
      account.userId,
    );
    expect((await page.request.get('/api/platform/forms')).status()).toBe(200);
  } finally {
    await admin.close();
  }
});

test('ignores a committed password setup response arriving after another account signs in', async ({
  page,
  baseURL,
}) => {
  const origin = new URL(baseURL!).origin;
  const previous = await registerGitHubAccount(page.request, origin, 'studio-late-setup-code');
  await authorizeAs(page, () => 'studio-late-setup-code');
  await page.goto('/?page=account');
  await page.getByRole('button', { name: '重新验证 GitHub 身份' }).click();
  await expect(page.getByText('GitHub 身份已重新验证，请设置内置登录方式。')).toBeVisible();
  await expect(page.getByLabel('登录用户名', { exact: true })).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed!: () => void;
  const saved = new Promise<void>((resolve) => {
    committed = resolve;
  });
  await page.route(
    '**/api/platform/account/password/setup',
    async (route) => {
      expect(route.request().method()).toBe('POST');
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committed();
      await gate;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await setCredentials(page, 'studio-late-setup-user');
  await saved;
  await page.getByRole('button', { name: '退出登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '登录表单工作台' })).toBeVisible();
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
  const current = await (await page.request.get('/api/platform/account')).json();
  expect(current.userId).not.toBe(previous.userId);
  release();
  await page.unrouteAll({ behavior: 'wait' });
  await expect(page.getByRole('heading', { name: '表单列表' })).toBeVisible();
  await expect(page.getByText('内置登录方式已设置，其他会话已退出。', { exact: true })).toHaveCount(
    0,
  );
  expect((await (await page.request.get('/api/platform/account')).json()).userId).toBe(
    current.userId,
  );
});
