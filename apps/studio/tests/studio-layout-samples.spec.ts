import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page, baseURL }) => {
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
});

test('material detail uses one content column and restores the narrow card context', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  await page.goto('/?catalog=materials&asset=text-input');
  const detail = page.getByRole('region', { name: '物料详情' });
  await expect(page.getByRole('navigation', { name: '物料条目' })).toHaveCount(0);
  await expect(detail.getByRole('region', { name: '资产 API' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 680 });
  await page.getByRole('button', { name: '返回物料目录' }).click();
  const search = page.getByRole('searchbox', { name: '搜索资产' });
  await search.fill('React');
  await search.press('Enter');
  const results = page.getByRole('region', { name: '物料列表滚动区' });
  const pagination = page.getByRole('navigation', { name: '分页' });
  const filters = page.getByRole('search', { name: '筛选物料' });
  await pagination.getByRole('button', { name: '下一页' }).click();
  await expect(pagination).toContainText('第 2 /');
  const cards = results.getByRole('button', { name: /^查看 / });
  const fixedPositions = async () => [
    (await filters.boundingBox())?.y,
    (await pagination.boundingBox())?.y,
  ];
  const beforeScroll = await fixedPositions();
  const card = cards.last();
  await card.scrollIntoViewIfNeeded();
  const top = await results.evaluate((el) => el.scrollTop);
  expect(await fixedPositions()).toEqual(beforeScroll);
  expect(top).toBeGreaterThan(0);
  await card.click();
  await expect(detail).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);
  await page.getByRole('button', { name: '返回物料目录' }).click();
  await expect(card).toHaveAttribute('aria-current', 'true');
  await expect(card).toBeFocused();
  await expect(search).toHaveValue('React');
  await expect(pagination).toContainText('第 2 /');
  await expect.poll(() => results.evaluate((el) => el.scrollTop)).toBeCloseTo(top, 0);
  await card.click();
  await page.goBack();
  await expect(card).toBeFocused();
  await expect.poll(() => results.evaluate((el) => el.scrollTop)).toBeCloseTo(top, 0);
});

test('form metadata stays single-column, preserves narrow keyboard order and saves', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1440, height: 850 });
  const created = await page.request.post('/api/platform/forms', {
    headers: { Origin: baseURL!, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: '单列样板' },
  });
  expect(created.ok()).toBeTruthy();
  await page.goto('/');
  await page.getByRole('button', { name: '管理 单列样板', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑名称与说明' }).click();
  const dialog = page.getByRole('dialog', { name: '编辑名称与说明' });
  const name = dialog.getByRole('textbox', { name: '名称', exact: true });
  const description = dialog.getByRole('textbox', { name: '说明', exact: true });
  const save = dialog.getByRole('button', { name: '保存表单信息' });
  await name.fill('单列样板已编辑');
  const first = (await name.boundingBox())!;
  const second = (await description.boundingBox())!;
  expect(second.x).toBeCloseTo(first.x, 0);
  expect(second.y).toBeGreaterThan(first.y + first.height);
  await page.setViewportSize({ width: 375, height: 680 });
  const narrowFirst = (await name.boundingBox())!;
  const narrowSecond = (await description.boundingBox())!;
  expect(narrowSecond.x).toBeCloseTo(narrowFirst.x, 0);
  expect(narrowSecond.y).toBeGreaterThan(narrowFirst.y + narrowFirst.height);
  expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(name).toHaveValue('单列样板已编辑');
  await name.focus();
  await page.keyboard.press('Tab');
  await expect(description).toBeFocused();
  await description.fill('在窄屏继续编辑');
  await page.keyboard.press('Tab');
  await expect(save).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(
    page.getByRole('button', { name: '管理 单列样板已编辑', exact: true }),
  ).toBeFocused();
  const formId = (await created.json()).formId;
  const saved = await page.request.get('/api/platform/forms/' + formId);
  expect(await saved.json()).toMatchObject({
    name: '单列样板已编辑',
    description: '在窄屏继续编辑',
  });
});
