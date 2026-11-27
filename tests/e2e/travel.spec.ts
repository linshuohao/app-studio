import { expect, test } from '@playwright/test';
import { chooseRangeDay } from './calendar';
test('家庭出行：非法工作值、监护人、双 Profile、日期和城市贯通到有效提交', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demos/travel');
  await page.getByRole('button', { name: '打开完整表单' }).click();
  const snapshot = page.getByTestId('travel-snapshot'),
    submission = page.getByTestId('travel-submission');
  await expect(snapshot).toContainText('"estimatedTotalMinor": 500');
  const ages = page.getByRole('textbox', { name: '出行时年龄', exact: true });
  await ages.nth(1).fill('-');
  await expect(snapshot).toContainText('"age": "-"');
  await expect(snapshot).toContainText('"estimatedTotalMinor": null');
  await ages.nth(1).fill('0');
  await expect(snapshot).toContainText('"estimatedTotalMinor": 500');
  await page.getByRole('textbox', { name: '监护人姓名', exact: true }).fill('  ');
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(page.getByTestId('travel-status')).toHaveText('校验未通过');
  await expect(page.getByText('未成年人须填写监护人姓名', { exact: true }).first()).toBeVisible();
  await ages.nth(1).fill('18');
  await expect(page.getByRole('textbox', { name: '监护人姓名', exact: true })).toHaveCount(0);
  await expect(snapshot).toContainText('"estimatedTotalMinor": 400');
  await ages.nth(1).fill('12');
  await page.getByRole('textbox', { name: '监护人姓名', exact: true }).fill('监护人已补');
  await page.getByLabel('呈现方式').selectOption('compact');
  const child = page.getByRole('article', { name: '被保人 儿童 B', exact: true });
  const childRegion = page.getByRole('region').filter({ has: child }).last();
  await childRegion.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog').filter({
    has: page.getByRole('heading', { name: '编辑被保险人', exact: true }),
  });
  await editor.getByRole('textbox', { name: '成员姓名', exact: true }).fill('儿童已编辑');
  await editor.getByRole('button', { name: '移到首位', exact: true }).click();
  await expect(editor.getByRole('textbox', { name: '成员姓名', exact: true })).toHaveValue(
    '儿童已编辑',
  );
  await page.keyboard.press('Escape');
  await page.getByLabel('呈现方式').selectOption('desktop');
  await expect(page.getByRole('textbox', { name: '成员姓名', exact: true }).first()).toHaveValue(
    '儿童已编辑',
  );
  await page.getByRole('button', { name: '选择日期', exact: true }).click();
  const dates = page.getByRole('dialog', { name: '出行日期' });
  await chooseRangeDay(dates, '结束日期', '2028-03-01');
  await dates.getByRole('button', { name: '确认日期', exact: true }).click();
  await expect(snapshot).toContainText('"estimatedTotalMinor": 750');
  await page
    .getByRole('combobox', { name: '目的地国家', exact: true })
    .selectOption({ label: '美国' });
  await expect(snapshot).toContainText('"city": null');
  await page.getByRole('searchbox', { name: '目的地城市', exact: true }).fill('西雅图');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByRole('button', { name: '西雅图市', exact: true }).click();
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(page.getByTestId('travel-status')).toHaveText('已交付模拟提交快照');
  await expect(submission).toContainText('"estimatedTotalMinor": 750');
  await expect(submission).toContainText('"id": "US:西雅图"');
  await expect(submission).toContainText('儿童已编辑');
  expect(errors).toEqual([]);
});
test('家庭出行：等待时编辑、外部失败、错误存量金额和未完成草稿', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/demos/travel');
  await page.getByRole('button', { name: '打开完整表单' }).click();
  const status = page.getByTestId('travel-status'),
    submission = page.getByTestId('travel-submission');
  await page.getByLabel('资格核验返回').selectOption('manual');
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(status).toHaveText('完整校验中');
  await expect(page.getByRole('list', { name: '资格核验记录' })).toContainText('等待返回');
  await page.getByRole('textbox', { name: '投保人姓名', exact: true }).fill('等待中已编辑');
  await expect(status).toHaveText('输入已变化，请重新提交');
  await page.getByRole('button', { name: '通过待处理核验', exact: true }).click();
  await expect(submission).toHaveText('null');
  await page.getByLabel('资格核验返回').selectOption('failure');
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(status).toHaveText('核验未完成');
  await expect(submission).toHaveText('null');
  await page.getByLabel('资格核验返回').selectOption('reject');
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(status).toHaveText('校验未通过');
  await page.getByLabel('资格核验返回').selectOption('pass');
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(status).toHaveText('已交付模拟提交快照');
  await expect(submission).toContainText('等待中已编辑');
  await page.getByRole('button', { name: '模拟导入错误总价', exact: true }).click();
  await page.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(status).toHaveText('校验未通过');
  await expect(submission).toHaveText('null');
  await expect(
    page.getByText('保存的试算金额与当前计算不一致', { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByTestId('travel-draft')).toContainText('"estimatedTotalMinor": 999');
  await page.getByRole('button', { name: '加载空白草稿', exact: true }).click();
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(page.getByTestId('travel-draft')).toContainText('"acknowledged": false');
  await expect(page.getByTestId('travel-draft')).toContainText('"estimatedTotalMinor": null');
  expect(errors).toEqual([]);
});
