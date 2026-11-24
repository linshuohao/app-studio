import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const runner = pathToFileURL(
  resolve(
    __dirname,
    '../../../prototypes/studio-components/assets/business-playground-runner.html',
  ),
).href;

for (const multiple of [false, true]) {
  test(
    'shared tree preserves keyboard and picker choices · ' + (multiple ? 'multiple' : 'single'),
    async ({ page }) => {
      await page.goto(runner + '?run#fields/' + (multiple ? 'multiple' : 'single'));
      const trigger = page.getByRole('button', {
        name: multiple ? '选择监听字段' : '选择绑定字段',
      });
      await trigger.click();
      const tree = page.getByRole('tree', { name: '字段层级' });
      const search = page.getByRole('searchbox', { name: '搜索字段' });
      await expect(tree).toHaveAttribute('data-density', 'regular');
      await expect(tree).toHaveAttribute('data-single-line', 'true');
      const first = tree.getByRole('treeitem').first();
      await expect(first).toHaveCSS('min-height', '32px');
      await expect(first.locator('.studio-field-row-label')).toHaveCSS('font-weight', '600');
      await expect(first.locator('.studio-field-row-label')).toHaveCSS('font-size', '12px');
      await search.focus();
      await page.keyboard.press('Tab');
      await expect(first.locator('[data-tree-focus]')).toBeFocused();
      if (!multiple) await expect(page.getByRole('tooltip')).toHaveText('需要整数');
      await page.keyboard.press('ArrowLeft');
      await expect(first).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('ArrowRight');
      await expect(first).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('ArrowDown');
      await expect(tree.getByRole('treeitem').nth(1).locator('[data-tree-focus]')).toBeFocused();
      await search.fill('年龄');
      const choices = tree.getByRole(multiple ? 'checkbox' : 'radio', { name: /年龄/ });
      await choices.first().focus();
      await page.keyboard.press('Enter');
      if (multiple) await choices.nth(1).check();
      await expect(choices.first()).toBeChecked();
      await page.getByRole('button', { name: '应用选择' }).click();
      await expect(trigger).toBeFocused();
      await trigger.click();
      await search.fill('年龄');
      await expect(choices.first()).toBeChecked();
      if (multiple) await expect(choices.nth(1)).toBeChecked();
      await choices.nth(1).click();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();
      await trigger.click();
      await search.fill('年龄');
      await expect(choices.first()).toBeChecked();
      if (multiple) await expect(choices.nth(1)).toBeChecked();
      else await expect(choices.nth(1)).not.toBeChecked();
    },
  );
}

test('keeps long field paths on one line and fixes the picker controls around the results', async ({
  page,
}) => {
  await page.setViewportSize({ width: 520, height: 700 });
  await page.goto(runner + '?run#fields/multiple');
  const trigger = page.getByRole('button', { name: '选择监听字段' });
  await trigger.click();
  const tree = page.getByRole('tree', { name: '字段层级' });
  const search = page.getByRole('searchbox', { name: '搜索字段' });
  await search.fill('internationalEmergencyContactTelephoneNumber');
  const path = tree.locator('.studio-field-row-path').filter({
    hasText: '/applicant/contact/internationalEmergencyContactTelephoneNumber',
  });
  await expect(path).toHaveCSS('white-space', 'nowrap');
  await expect(path).toHaveCSS('font-size', '11px');
  expect(await tree.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  await tree.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  expect(await tree.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const selected = page.getByRole('region', { name: '已选字段' });
  expect((await selected.boundingBox())!.y).toBeGreaterThan((await tree.boundingBox())!.y);
  await expect(page.getByRole('button', { name: '应用选择' })).toBeInViewport();
  await expect(search).toBeInViewport();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
});

test('layout binding uses the same row typography and applies the chosen field', async ({
  page,
}) => {
  await page.goto(runner + '?run#layoutfield');
  const trigger = page.getByRole('button', { name: '选择绑定字段' });
  await trigger.click();
  const tree = page.getByRole('tree', { name: '字段层级' });
  const field = tree.getByRole('treeitem', { name: 'name', exact: true });
  await expect(tree).toHaveAttribute('data-single-line', 'true');
  await expect(field.locator('.studio-field-row-label')).toHaveCSS('font-size', '12px');
  await expect(field.locator('.studio-field-row-path')).toHaveCSS('font-size', '11px');
  await field.getByRole('button').click();
  await page.getByRole('button', { name: '应用选择' }).click();
  await expect(trigger).toHaveAccessibleDescription('姓名');
});

test('field tree hides path and metadata independently of selection and keeps groups navigable', async ({
  page,
}) => {
  await page.goto(runner + '?run#fieldtree');
  const tree = page.getByRole('tree', { name: '字段层级' });
  const name = tree.getByRole('treeitem', { name: '姓名' });
  await expect(name).toContainText('文本 · 必填 · 已关联');
  await expect(name).toContainText('/applicant/name');
  await expect(tree.getByRole('radio')).toHaveCount(0);

  await page.goto(runner + '?run#fieldtree/hidden');
  await page.reload();
  await expect(name).toHaveText('姓名');
  const group = tree.getByRole('treeitem', { name: '投保人', exact: true });
  await expect(group.getByRole('checkbox')).toHaveCount(0);
  await name.getByRole('checkbox').check();
  await expect(name.getByRole('checkbox')).toBeChecked();
  await expect(tree.getByRole('checkbox', { name: '年龄' })).toBeDisabled();

  await page.goto(runner + '?run#fieldtree/disabled');
  await page.reload();
  await expect(name.getByRole('checkbox')).toBeDisabled();
  await group.getByRole('button', { name: '收起 投保人' }).click();
  await expect(name).toHaveCount(0);
});

test('opens the FieldTree and FieldPicker live examples from the handbook index', async ({
  page,
}) => {
  const handbook = pathToFileURL(
    resolve(__dirname, '../../../prototypes/studio-design-handbook.html'),
  ).href;
  for (const component of ['field-tree', 'field-picker']) {
    await page.goto(handbook);
    await page.locator(`a[href="studio-components/${component}.html"]`).first().click();
    const example = page.locator('iframe[title*="交互预览"]').first().contentFrame();
    if (component === 'field-picker') {
      await example.getByRole('button', { name: '选择绑定字段' }).click();
    }
    await expect(example.getByRole('tree', { name: '字段层级' })).toBeVisible();
  }
});

test('right-aligns metadata across rows and moves it below the label in a narrow tree', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  await page.goto(runner + '?run#fieldtree');
  const tree = page.getByRole('tree', { name: '字段层级' });
  const name = tree.getByRole('treeitem', { name: '姓名', exact: true });
  const age = tree.getByRole('treeitem', { name: '年龄', exact: true });
  const meta = name.locator('.studio-field-row-meta');
  await expect(meta).toHaveCSS('text-align', 'end');
  const right = (box: { x: number; width: number }) => box.x + box.width;
  expect(
    right((await meta.boundingBox())!) -
      right((await age.locator('.studio-field-row-meta').boundingBox())!),
  ).toBeCloseTo(0);

  await page.setViewportSize({ width: 380, height: 700 });
  await expect(meta).toHaveCSS('text-align', 'start');
  const label = (await name.locator('.studio-field-row-label').boundingBox())!;
  expect((await meta.boundingBox())!.y).toBeGreaterThan(label.y + label.height);
  await expect(name.locator('.studio-field-row-path')).toHaveCSS('white-space', 'nowrap');
});
