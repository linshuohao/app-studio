import { expect, test } from '@playwright/test';

test('offers peer login methods and switches to a dedicated password view', async ({ page }) => {
  await page.route('**/api/platform/local-login', (route) =>
    route.fulfill({
      json: { enabled: true, username: 'local-development-only', roles: ['admin'] },
    }),
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: '以本地开发账号登录' })).toBeVisible();
  await expect(page.getByLabel('用户名', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await expect(page.getByLabel('用户名', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '以本地开发账号登录' })).toHaveCount(0);
  await page.getByRole('button', { name: '返回其他登录方式' }).click();
  await expect(page.getByRole('button', { name: '以本地开发账号登录' })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
