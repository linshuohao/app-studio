import { expect, type Page } from '@playwright/test';
import { schemaSource } from './data-schema-fixture';
import { chooseWorkingVersionAction } from './working-version-menu';

export function workingVersionRow(page: Page, name: string) {
  return page.getByRole('row').filter({
    has: page.getByRole('button', { name, exact: true }),
  });
}

export async function createWorkingVersion(page: Page, name: string) {
  await page.getByRole('button', { name: '新建草稿', exact: true }).click();
  await page.getByLabel('版本名称', { exact: true }).fill(name);
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

export async function saveWorkingConfig(page: Page, text?: string) {
  if (text !== undefined) await (await schemaSource(page)).fill(text);
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/versions') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  const { versionId } = (await response.json()) as { versionId: string };
  await expect(page.getByRole('status').getByText('已保存', { exact: true })).toBeVisible();
  return versionId;
}

export async function chooseWorkingPublication(page: Page, workName: string) {
  await chooseWorkingVersionAction(page, '发布', workingVersionRow(page, workName));
  return page.getByRole('dialog', { name: '发布版本', exact: true });
}
