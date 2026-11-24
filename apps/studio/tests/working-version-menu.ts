import type { Locator, Page } from '@playwright/test';

export function workingVersionMenu(scope: Page | Locator) {
  return scope.getByRole('button', { name: /^操作 / });
}

export function workingVersionName(scope: Page | Locator) {
  return scope.locator('button.working-version-name');
}

export async function chooseWorkingVersionAction(
  page: Page,
  action: string,
  scope: Page | Locator = page,
) {
  if (action === '编辑配置' || action === '查看配置') {
    await workingVersionName(scope).click();
    return;
  }
  await workingVersionMenu(scope).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
