import { expect, test } from '@playwright/test';
test('组合成员：同实例 Profile、弹层焦点、移动删除、条件与窄屏网格', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/demos/members');
  await page.getByRole('button', { name: '打开成员验收' }).click();
  const rows = () => page.getByRole('region', { name: '成员', exact: true });
  await expect(page.getByRole('textbox', { name: '成员姓名', exact: true })).toHaveCount(2);
  await page.getByRole('textbox', { name: '成员姓名', exact: true }).first().fill('成人 A 已改');
  await page.setViewportSize({ width: 450, height: 900 });
  const nameBox = await page
    .getByRole('textbox', { name: '成员姓名', exact: true })
    .first()
    .boundingBox();
  const ageBox = await page
    .getByRole('textbox', { name: '成员年龄', exact: true })
    .first()
    .boundingBox();
  expect(ageBox!.y).toBeGreaterThan(nameBox!.y);
  expect(Math.abs(ageBox!.x - nameBox!.x)).toBeLessThan(1);
  await page.getByLabel('呈现方式').selectOption('compact');
  await expect(page.getByRole('textbox', { name: '成员姓名', exact: true })).toHaveCount(0);
  await rows().nth(1).getByRole('button', { name: '编辑', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '编辑被保人' });
  await expect(modal).toBeVisible();
  const done = modal.getByRole('button', { name: '完成', exact: true });
  await done.focus();
  await page.keyboard.press('Tab');
  await expect(modal.getByRole('button', { name: '关闭编辑' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(done).toBeFocused();
  await modal.getByRole('textbox', { name: '成员姓名', exact: true }).fill('儿童 B 已改');
  await modal.getByRole('button', { name: '移到首位' }).click();
  await expect(modal.getByRole('textbox', { name: '成员姓名', exact: true })).toHaveValue(
    '儿童 B 已改',
  );
  await expect(page.getByTestId('members-snapshot')).toContainText('"name": "儿童 B 已改"');
  await page.keyboard.press('Escape');
  await expect(modal).toHaveCount(0);
  await expect(rows().first().getByRole('button', { name: '编辑', exact: true })).toBeFocused();
  await page.getByLabel('呈现方式').selectOption('desktop');
  await expect(page.getByRole('textbox', { name: '成员姓名', exact: true }).first()).toHaveValue(
    '儿童 B 已改',
  );
  await expect(page.getByRole('textbox', { name: '成员姓名', exact: true }).nth(1)).toHaveValue(
    '成人 A 已改',
  );
  await page.getByRole('textbox', { name: '监护人姓名', exact: true }).first().fill('');
  await page.getByRole('checkbox', { name: '显示监护人字段' }).uncheck();
  await expect(page.getByRole('textbox', { name: '监护人姓名', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '完整校验', exact: true }).click();
  await expect(page.getByTestId('members-result')).toHaveText('invalid');
  await page.getByRole('checkbox', { name: '显示监护人字段' }).check();
  await page.getByRole('textbox', { name: '监护人姓名', exact: true }).first().fill('监护已补');
  await page.getByRole('button', { name: '完整校验', exact: true }).click();
  await expect(page.getByTestId('members-result')).toContainText('"name":"儿童 B 已改"');
  await page.getByLabel('呈现方式').selectOption('compact');
  await rows().first().getByRole('button', { name: '编辑', exact: true }).click();
  await modal.getByRole('button', { name: '删除成员' }).click();
  await expect(modal).toHaveCount(0);
  await expect(rows()).toHaveCount(1);
  await expect(
    rows().first().getByRole('heading', { name: '成人 A 已改', exact: true }),
  ).toBeVisible();
  await expect(rows().first().getByRole('button', { name: '删除成员' })).toBeDisabled();
  const add = page.getByRole('button', { name: '新增成员' });
  for (let i = 0; i < 4; i++) await add.click();
  await expect(rows()).toHaveCount(5);
  await expect(add).toBeDisabled();
  expect(errors).toEqual([]);
});
