import { expect, test } from '@playwright/test';
test('正式物料真实输入、未知选项、字段校验、Host 改值与完整快照交付', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/basic');
  await page.getByRole('button', { name: '打开物料验收' }).click();
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => Object.hasOwn(globalThis, '__FORM_ENGINE_DEVTOOLS__'))).toBe(
    false,
  );
  await expect(page.getByLabel('表单接入诊断')).toHaveCount(0);
  const name = page.getByRole('textbox', { name: '姓名', exact: true });
  const age = page.getByRole('textbox', { name: '年龄', exact: true });
  const plan = page.getByRole('combobox', { name: '方案', exact: true });
  await expect(name).toHaveValue('Alice');
  await expect(plan.getByRole('option', { name: '选项不可用' })).toHaveJSProperty('selected', true);
  await expect(page.getByText('¥5.00', { exact: true })).toBeVisible();
  await page.locator('label').filter({ hasText: '姓名' }).click();
  await expect(name).toBeFocused();
  await name.fill(' 张三 ');
  await age.fill('-');
  await page.getByRole('button', { name: '校验并交付快照' }).click();
  await expect(page.getByTestId('materials-result')).toHaveText('invalid');
  await expect(age).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByTestId('materials-snapshot')).toContainText('"age": "-"');
  await page.getByRole('button', { name: 'Host 填入示例' }).click();
  await expect(age).toHaveValue('0');
  await expect(name).toHaveValue('Host 姓名');
  await name.fill(' 张三 ');
  await plan.selectOption({ label: '升级方案' });
  await page.getByRole('button', { name: '校验并交付快照' }).click();
  await expect(page.getByTestId('materials-result')).toContainText('"name":" 张三 "');
  await expect(page.getByTestId('materials-result')).toContainText('"age":0');
  await expect(page.getByTestId('materials-result')).toContainText('"plan":"plus"');
  await expect(page.getByTestId('materials-result')).toContainText('"acknowledged":true');
});
