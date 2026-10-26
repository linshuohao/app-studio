import { expect, test } from '@playwright/test';
test('built Playground supports local input controls and API access', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '动态表单引擎 · Playground' })).toBeVisible();
  const input = page.getByRole('textbox', { name: '示例输入' });
  await input.fill('工作区接入正常');
  await expect(page.getByRole('status')).toHaveText('当前输入：工作区接入正常');
  await expect(input).toHaveCSS('border-style', 'solid');
  await expect(input).toHaveCSS('height', '32px');
  await page.getByRole('button', { name: '清空' }).click();
  await expect(input).toHaveValue('');
  await expect(page.getByRole('status')).toHaveText('当前输入：（空）');
  const api = await request.get('http://127.0.0.1:3101/');
  expect(api.status()).toBe(200);
  expect(await api.text()).toBe('Hello World!');
  expect(errors).toEqual([]);
});
