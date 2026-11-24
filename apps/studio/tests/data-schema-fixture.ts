import { expect, type Page } from '@playwright/test';

export async function closeWorkbenchDrawer(page: Page) {
  const drawer = page.locator('dialog.workbench-drawer[open]');
  if (await drawer.count()) {
    await drawer
      .locator(':scope > .toolbar')
      .getByRole('button', { name: '关闭', exact: true })
      .click();
    await expect(drawer).toHaveCount(0);
  }
}

export async function schemaSource(page: Page) {
  await closeWorkbenchDrawer(page);
  await page.getByRole('navigation', { name: '配置编辑视图' }).waitFor();
  const open = page.getByRole('button', { name: 'JSON 原文', exact: true });
  if (await open.isVisible()) await open.click();
  const input = page.getByRole('textbox', { name: '配置原文', exact: true });
  if (!(await input.isVisible())) {
    await page.getByRole('button', { name: /^(文本查看 \/ 修复|格式化文本)$/ }).click();
  }
  return input;
}

export async function openSchemaDraft(page: Page, source: string) {
  await page.goto('/');
  const origin = new URL(page.url()).origin;
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: origin },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  await page.reload();
  await page.getByRole('button', { name: '新建表单', exact: true }).click();
  await page.getByLabel('表单名称').fill('模型验收 ' + crypto.randomUUID().slice(0, 8));
  await page.getByRole('button', { name: '创建表单', exact: true }).click();
  await page.getByRole('button', { name: '新建草稿', exact: true }).click();
  await page.getByLabel('版本名称').fill('模型草稿');
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
  await (await schemaSource(page)).fill(source);
  await page.getByRole('button', { name: '字段', exact: true }).click();
}
