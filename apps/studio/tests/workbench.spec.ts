import { expect, test } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';
import { schemaSource } from './data-schema-fixture';
import { chooseWorkingVersionAction } from './working-version-menu';
import {
  chooseWorkingPublication,
  createWorkingVersion,
  workingVersionRow,
} from './working-version-fixture';

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
  await createWorkingVersion(page, '正式草稿');
  const source = await schemaSource(page);
  const format = page.getByRole('button', { name: '格式化 JSON' });
  await source.fill('{"bad":');
  await format.click();
  await expect(source).toHaveValue('{"bad":');
  await expect(
    page.getByRole('main').getByRole('alert').filter({ hasText: '当前原文已保留' }),
  ).toContainText('当前原文已保留');
  await source.fill('{"value":9007199254740993,"value":-0}');
  await format.click();
  await expect(source).toHaveValue('{\n    "value": 9007199254740993,\n    "value": -0\n}\n');
  const text = JSON.stringify({
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
  });
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
  const id = new URL(page.url()).searchParams.get('form');
  const versions = await page.request.get(`/api/platform/forms/${id}/versions`);
  expect(versions.ok()).toBeTruthy();
  const [{ versionId }] = await versions.json();
  await page.getByRole('button', { name: '返回版本列表', exact: true }).click();
  await chooseWorkingVersionAction(page, '保存历史');
  const history = page.getByRole('dialog', { name: '保存历史' });
  await expect(history.getByText('首版投保配置')).toBeVisible();
  await history.getByRole('button', { name: '查看快照' }).click();
  await expect(await schemaSource(page)).not.toBeEditable();
  await page.getByRole('button', { name: '预览配置' }).click();
  await expect(page.getByRole('region', { name: '受控预览' })).toContainText(
    '家庭短期出行投保录入单',
  );
  await page.getByRole('button', { name: '关闭预览' }).click();
  await page.getByRole('button', { name: '返回保存历史' }).click();
  await history.getByRole('button', { name: '关闭', exact: true }).click();
  let resolvePublish!: () => void;
  const heldPublish = new Promise<void>((resolve) => (resolvePublish = resolve));
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
    (request) => request.method() === 'POST' && request.url().endsWith('/releases'),
  );
  const published = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/releases'),
  );
  const publish = await chooseWorkingPublication(page, '正式草稿');
  await publish.getByRole('button', { name: '确认发布' }).click();
  await requested;
  await page.goBack();
  const destination = page.url();
  resolvePublish();
  const response = await published;
  expect(response.status()).toBe(201);
  const { releaseId } = await response.json();
  await expect(page).toHaveURL(destination);
  await page.goto(`/?form=${id}`);
  const original = workingVersionRow(page, '正式草稿');
  await expect(original.getByText(/已发布/)).toBeVisible();
  await chooseWorkingVersionAction(page, '基于此版创建新版', original);
  await page.getByLabel('版本名称', { exact: true }).fill('继续编辑');
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
  await (await schemaSource(page)).fill('{"latest":true}');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('searchbox', { name: '搜索表单' }).fill('Studio 完整验收');
  await page.getByRole('searchbox', { name: '搜索表单' }).press('Enter');
  const row = page.getByRole('row').filter({ hasText: 'Studio 完整验收' });
  await row.getByRole('cell').nth(2).getByRole('button').click();
  await expect(await schemaSource(page)).toHaveValue('{\n    "latest": true\n}\n');
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await row.getByRole('cell').nth(3).getByRole('button').click();
  const hostLink = page.getByRole('link', { name: '在示例 Host 中打开' });
  const release = '/host?releaseId=' + releaseId;
  await expect(hostLink).toHaveAttribute('href', release);
  await expect(page.getByRole('button', { name: `查看配置版本 ${versionId}` })).toBeVisible();
  const context = await browser.newContext();
  try {
    const host = await context.newPage();
    await host.goto(new URL(release, page.url()).href);
    await expect(host.getByRole('region', { name: '已装载实例' })).toContainText(
      '家庭短期出行投保录入单',
    );
  } finally {
    await context.close();
  }
});
