import { expect, test } from '@playwright/test';
import { schemaSource } from './data-schema-fixture';

test('browses installed assets and protects the last administrator in the Linear UI', async ({
  page,
}) => {
  await page.goto('/?studio=legacy&catalog=materials');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page).toHaveURL(/\?catalog=materials$/);
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '物料目录', exact: true })).toBeVisible();
  await page.getByRole('searchbox', { name: '搜索资产' }).fill('remote-select');
  await page.getByRole('searchbox', { name: '搜索资产' }).press('Enter');
  await page.getByRole('button', { name: '查看 remote-select', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Host 能力', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Host 请求 search' })).toBeVisible();
  await page.getByRole('button', { name: '纯函数', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索资产' }).fill('travel.personPremium');
  await page.getByRole('searchbox', { name: '搜索资产' }).press('Enter');
  await page.getByRole('button', { name: '查看 travel.personPremium', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'ratePolicy', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '成员', exact: true }).click();
  await page.getByRole('button', { name: '编辑成员 studio-test', exact: true }).click();
  await page.getByRole('checkbox', { name: '启用成员访问' }).uncheck();
  await page.getByRole('button', { name: '确认停用', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('至少保留一位有效管理员');
  await page.getByRole('checkbox', { name: '启用成员访问' }).check();
  await expect(page.getByRole('button', { name: '保存成员设置', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '表单', exact: true }).click();
  await page.getByRole('button', { name: '新建表单', exact: true }).click();
  await page.getByLabel('表单名称').fill('目录上下文验证');
  await page.getByRole('button', { name: '创建表单', exact: true }).click();
  await page.getByRole('button', { name: '新建草稿', exact: true }).click();
  await page.getByLabel('版本名称').fill('目录草稿');
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
  await (await schemaSource(page)).fill('{"draft":true}');
  await page.getByRole('button', { name: '物料', exact: true }).click();
  await expect(page.getByRole('heading', { name: '物料目录', exact: true })).toBeVisible();
  await page
    .getByRole('navigation', { name: '主导航' })
    .getByRole('button', { name: '表单', exact: true })
    .click();
  await expect(await schemaSource(page)).toHaveValue('{"draft":true}');
});

test('preserves builtin account compatibility, password changes, deactivation and restoration', async ({
  page,
  browser,
}) => {
  await page.goto('/');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '成员', exact: true }).click();
  // Compatibility fixture: existing builtin accounts remain supported; new members now apply for admission.
  const created = await page.request.post('/api/platform/members', {
    headers: { Origin: new URL(page.url()).origin },
    data: {
      username: 'new-member',
      password: 'initial-member-password',
      createAccount: true,
      identityVerified: true,
      roles: ['viewer'],
    },
  });
  expect(created.ok()).toBeTruthy();
  await expect(page.getByRole('button', { name: '添加成员', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '刷新成员列表', exact: true }).click();
  await expect(page.getByRole('row').filter({ hasText: 'new-member' })).toContainText('查看者');
  const context = await browser.newContext();
  try {
    const member = await context.newPage();
    await member.goto(new URL('/', page.url()).href);
    await expect(
      member
        .getByLabel('用户名', { exact: true })
        .or(member.getByRole('button', { name: '使用账号密码登录', exact: true })),
    ).toBeVisible();
    if (await member.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
      await member.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
    await member.getByLabel('用户名').fill('new-member');
    await member.getByLabel('密码', { exact: true }).fill('initial-member-password');
    await member.getByRole('button', { name: '登录', exact: true }).click();
    await expect(member.getByRole('heading', { name: '表单列表' })).toBeVisible();
    await expect(member.getByRole('button', { name: '成员', exact: true })).toHaveCount(0);
    await member.getByRole('button', { name: '我的账号', exact: true }).press('Enter');
    const accountMenu = member.getByRole('menuitem', { name: '账号与权限', exact: true });
    await expect(accountMenu).toBeFocused();
    await accountMenu.press('Enter');
    await member.getByLabel('当前密码', { exact: true }).fill('initial-member-password');
    await member.getByLabel('新密码', { exact: true }).fill('changed-member-password');
    await member.getByLabel('确认新密码', { exact: true }).fill('changed-member-password');
    await member.getByRole('button', { name: '更新密码', exact: true }).click();
    await expect(member.getByText('密码已更新，其他会话已退出。')).toBeVisible();
    await member.getByRole('button', { name: '退出登录', exact: true }).click();
    await expect(
      member
        .getByLabel('用户名', { exact: true })
        .or(member.getByRole('button', { name: '使用账号密码登录', exact: true })),
    ).toBeVisible();
    if (await member.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
      await member.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
    await member.getByLabel('用户名').fill('new-member');
    await member.getByLabel('密码', { exact: true }).fill('changed-member-password');
    await member.getByRole('button', { name: '登录', exact: true }).click();
    await expect(member.getByRole('heading', { name: '表单列表' })).toBeVisible();
    await page.getByRole('button', { name: '编辑成员 new-member' }).click();
    await page.getByLabel('启用成员访问').uncheck();
    await page.getByRole('button', { name: '确认停用' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await member.reload();
    await expect(member.getByRole('heading', { name: '团队成员资格已停用' })).toBeVisible();
    await expect(member.getByRole('button', { name: '账号设置' })).toBeVisible();
    await page.getByRole('button', { name: '编辑成员 new-member' }).click();
    await page.getByLabel('启用成员访问').check();
    await page.getByRole('button', { name: '确认恢复' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await member.reload();
    await expect(member.getByRole('heading', { name: '表单列表' })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('pages the pure function table and restores its place after viewing details', async ({
  page,
}) => {
  await page.goto('/?catalog=functions');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  const functions = page.getByRole('region', { name: '纯函数列表' });
  const pagination = page.getByRole('navigation', { name: '分页' });
  await expect(functions.getByRole('columnheader')).toHaveText([
    '函数名称',
    '标识',
    '用途分类',
    '说明',
    '版本',
    '技术',
    '操作',
  ]);
  await expect(functions.locator('tbody tr')).toHaveCount(10);
  await pagination.getByRole('button', { name: '下一页' }).click();
  await expect(pagination.locator('output')).toContainText('第 2 /');
  const name = await functions.getByRole('button').first().getAttribute('aria-label');
  const open = functions.getByRole('button', { name: name!, exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: '资产 API' })).toBeVisible();
  await page.getByRole('button', { name: '返回纯函数目录' }).click();
  await expect(pagination.locator('output')).toContainText('第 2 /');
  await expect(open).toBeFocused();

  await pagination.getByRole('combobox').click();
  await page.getByRole('option', { name: '20', exact: true }).click();
  const catalog = await page.request.get('/api/platform/catalog/functions');
  expect(catalog.ok()).toBeTruthy();
  const installedFunctions = await catalog.json();
  await expect(functions.locator('tbody tr')).toHaveCount(Math.min(20, installedFunctions.length));
  await expect(pagination.locator('output')).toContainText('第 1 /');
  await page.setViewportSize({ width: 850, height: 800 });
  await expect
    .poll(() => functions.evaluate((el) => el.scrollWidth - el.clientWidth))
    .toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(850);

  await page.getByRole('searchbox', { name: '搜索资产' }).fill('travel.personPremium');
  await page.getByRole('searchbox', { name: '搜索资产' }).press('Enter');
  await expect(pagination.locator('output')).toHaveText('第 1 / 1 页，共 1 条');
  await page.getByRole('button', { name: '查看 travel.personPremium', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'ratePolicy', exact: true })).toBeVisible();
});
