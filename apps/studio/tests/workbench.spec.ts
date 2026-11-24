import { type Page as SourcePage } from '@playwright/test';
async function textMode(page: SourcePage) {
  if (!(await page.getByRole('textbox', { name: '配置原文', exact: true }).isVisible()))
    await page.getByRole('button', { name: /^(文本查看 \/ 修复|格式化文本)$/ }).click();
}

import { expect, test } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';

test('lists independent save and publish summaries and opens their real details', async ({
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
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('Studio 完整验收');
  await page.getByRole('button', { name: '创建表单' }).click();
  const source = page.getByLabel('配置原文');
  const format = page.getByRole('button', { name: '格式化 JSON' });
  await textMode(page);
  await source.fill('{"bad":');
  await format.click();
  await textMode(page);
  await expect(source).toHaveValue('{"bad":');
  await expect(
    page.getByRole('main').getByRole('alert').filter({ hasText: '当前原文已保留' }),
  ).toContainText('当前原文已保留');
  await textMode(page);
  await source.fill('{"value":9007199254740993,"value":-0}');
  await format.click();
  await textMode(page);
  await expect(source).toHaveValue('{\n    "value": 9007199254740993,\n    "value": -0\n}\n');
  const text = JSON.stringify({
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
  });
  await textMode(page);
  await source.fill(text);
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '保存备注' }).click();
  await page.getByLabel('保存备注（选填）').fill('首版投保配置');
  await page
    .getByRole('dialog', { name: '保存备注' })
    .getByRole('button', { name: '关闭' })
    .click();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const version = await page.locator('.version code').textContent();
  await page.getByRole('button', { name: '配置历史', exact: true }).click();
  await page.getByRole('button', { name: '查看版本 ' + version }).click();
  await textMode(page);
  await expect(source).not.toBeEditable();
  await expect(page.getByText('首版投保配置', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '预览配置' }).click();
  await expect(page.getByRole('region', { name: '受控试填' })).toContainText(
    '家庭短期出行投保录入单',
  );
  await page.getByRole('button', { name: '关闭预览' }).click();
  await page.getByRole('button', { name: '发布所选配置版本' }).click();
  let completePublish!: () => void;
  const heldPublish = new Promise<void>((resolve) => (completePublish = resolve));
  await page.route(
    '**/api/platform/forms/*/releases',
    async (route) => {
      const response = await route.fetch();
      await heldPublish;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const requested = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/releases'),
  );
  await page.getByRole('button', { name: '确认发布' }).click();
  await requested;
  await page.goBack();
  const destination = page.url();
  completePublish();
  await expect(page.getByText('发布成功', { exact: true })).toBeVisible();
  expect(page.url()).toBe(destination);
  await page.getByRole('button', { name: '查看发布记录' }).click();
  expect(new URL(page.url()).searchParams.get('release')).toBeTruthy();
  const release = await page
    .getByRole('link', { name: '打开 Host', exact: true })
    .getAttribute('href');
  await page.getByRole('button', { name: '配置工作台' }).click();
  await textMode(page);
  await source.fill('{"latest":true}');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('searchbox', { name: '搜索表单' }).fill('Studio 完整验收');
  await page.getByRole('searchbox', { name: '搜索表单' }).press('Enter');
  const row = page.getByRole('row').filter({ hasText: 'Studio 完整验收' });
  await row.getByRole('cell').nth(2).getByRole('button').click();
  await textMode(page);
  await expect(source).toHaveValue('{\n    "latest": true\n}\n');
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await row.getByRole('cell').nth(3).getByRole('button').click();
  const hostLink = page.getByRole('link', { name: '在示例 Host 中打开' });
  await expect(hostLink).toHaveAttribute('href', release!);
  await expect(page.getByRole('button', { name: `查看配置版本 ${version}` })).toBeVisible();
  const context = await browser.newContext();
  try {
    const host = await context.newPage();
    await host.goto(new URL(release!, page.url()).href);
    await expect(host.getByRole('region', { name: '已装载实例' })).toContainText(
      '家庭短期出行投保录入单',
    );
  } finally {
    await context.close();
  }
});
