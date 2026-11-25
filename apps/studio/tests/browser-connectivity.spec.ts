import { expect, test } from '@playwright/test';

const offlineMessage = /浏览器当前处于离线状态/;

test('shows browser connectivity changes without moving focus', async ({ context, page }) => {
  await page.goto('/');
  const login = page.getByRole('button', { name: '使用账号密码登录', exact: true });
  await login.click();
  await page.getByRole('button', { name: '返回其他登录方式', exact: true }).click();
  await login.focus();
  const notice = page.getByRole('status').filter({ hasText: offlineMessage });
  await expect(notice).toBeHidden();

  await context.setOffline(true);
  await expect(notice).toBeVisible();
  await expect(login).toBeEnabled();
  await expect(login).toBeFocused();

  await context.setOffline(false);
  await expect(notice).toBeHidden();
  await expect(login).toBeFocused();
});

test('hydrates an initially offline browser and preserves root metadata', async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on('pageerror', (error) => hydrationErrors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /hydrat|Minified React error #(?:418|423|425)/i.test(message.text())
    ) {
      hydrationErrors.push(message.text());
    }
  });

  // Leave navigation available so Next.js can serve HTML and scripts for hydration.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { get: () => false });
  });
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
  const html = await response?.text();
  expect(html).toContain('<title>表单工作台</title>');
  expect(html).not.toMatch(offlineMessage);
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
  await expect(page).toHaveTitle('表单工作台');
  await expect(page.getByRole('status').filter({ hasText: offlineMessage })).toBeVisible();
  expect(hydrationErrors).toEqual([]);
});
