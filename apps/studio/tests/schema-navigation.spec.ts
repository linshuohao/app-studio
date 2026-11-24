import { expect, test } from '@playwright/test';
import { closeWorkbenchDrawer, openSchemaDraft, schemaSource } from './data-schema-fixture';

const root = '/data/schema';
const group = root + '/properties/insured';
const age = group + '/properties/age';
const fixture = {
  data: {
    schema: {
      type: 'object',
      properties: {
        insured: { type: 'object', properties: { age: { type: 'integer', minimum: 0 } } },
        plan: { type: 'string' },
        extra: { type: 'object', properties: { street: { type: 'string' } } },
      },
    },
  },
};
test('protects pending values on node and view changes and keeps one undo per apply', async ({
  page,
}) => {
  await openSchemaDraft(page, JSON.stringify(fixture));
  const select = (path: string) => page.locator('[data-schema-path="' + path + '"]').click();
  const click = (name: string) => page.getByRole('button', { name, exact: true }).click();
  await select(age);
  const minimum = page.getByLabel('最小值', { exact: true });
  await minimum.fill('abc');
  await page.keyboard.press('Escape');
  await click('应用并继续');
  await expect(minimum).toHaveValue('abc');
  await expect(
    page
      .getByRole('region', { name: '模型属性' })
      .getByText('最小值需要有效的 JSON 值。', { exact: true }),
  ).toBeVisible();
  await minimum.fill('7');
  await page.keyboard.press('Escape');
  await click('留在此处');
  await expect(minimum).toHaveValue('7');
  await page.getByRole('button', { name: '在 JSON 中定位', exact: true }).click();
  await click('应用并继续');
  const source = await schemaSource(page);
  expect(
    JSON.parse(await source.inputValue()).data.schema.properties.insured.properties.age.minimum,
  ).toBe(7);
  await click('撤销');
  expect(JSON.parse(await source.inputValue())).toEqual(fixture);
  await click('字段');
  await expect(minimum).toHaveValue('0');
  await minimum.fill('8');
  await page.keyboard.press('Escape');
  await click('放弃修改并继续');
  await select(age);
  await expect(minimum).toHaveValue('0');
});

test('restores the outline, scroll and narrow detail; falls back to the nearest surviving model', async ({
  page,
}) => {
  const many = Object.fromEntries(
    Array.from({ length: 35 }, (_, i) => ['field' + i, { type: 'string' }]),
  );
  const source = JSON.stringify({
    ...fixture,
    data: {
      schema: {
        ...fixture.data.schema,
        properties: { ...many, ...fixture.data.schema.properties },
      },
    },
  });
  await openSchemaDraft(page, source);
  await page.getByRole('button', { name: '收起extra', exact: true }).click();
  await page.locator('[data-schema-path="' + age + '"]').click();
  const outline = page.locator('nav.semantic-outline');
  const before = await outline.evaluate((el) => el.scrollTop);
  expect(before).toBeGreaterThan(0);
  await page.getByRole('button', { name: '在 JSON 中定位', exact: true }).click();
  await schemaSource(page);
  await page.getByRole('button', { name: '字段', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'age', exact: true })).toBeVisible();
  expect(await outline.evaluate((el) => el.scrollTop)).toBe(before);
  await expect(outline.locator('button[aria-label="展开extra"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.setViewportSize({ width: 390, height: 780 });
  await page.getByRole('button', { name: '在 JSON 中定位', exact: true }).click();
  const editor = await schemaSource(page);
  const changed = JSON.parse(source);
  delete changed.data.schema.properties.insured.properties.age;
  await editor.fill(JSON.stringify(changed));
  await page.getByRole('button', { name: '字段', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'insured', exact: true })).toBeVisible();
  await closeWorkbenchDrawer(page);
  await expect(page.locator('[data-schema-path="' + group + '"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('keeps the other editor and draft-writing tools locked until the active edit finishes', async ({
  page,
}) => {
  await openSchemaDraft(page, JSON.stringify(fixture));
  await page.locator('[data-schema-path="' + age + '"]').click();
  const minimum = page.getByLabel('最小值', { exact: true });
  await minimum.fill('7');
  const addRule = page.getByRole('combobox', { name: '添加规则或约束' });
  await expect(addRule).toBeDisabled();
  await expect(
    page
      .getByRole('group', { name: '配置原文工具栏' })
      .getByRole('button', { name: '导入 JSON', exact: true }),
  ).toBeHidden();
  await expect(page.locator('button.workspace-save')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '留在此处', exact: true }).click();
  await expect(minimum).toHaveValue('7');
  await page.getByRole('button', { name: '取消属性修改', exact: true }).click();
  await addRule.selectOption('condition');
  await expect(minimum).toBeDisabled();
  await page
    .getByRole('form', { name: '新增条件规则' })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(minimum).toBeEnabled();
});

test('keeps module navigation visible and returns from JSON to the originating module', async ({
  page,
}) => {
  await openSchemaDraft(
    page,
    JSON.stringify({
      ...fixture,
      views: { desktop: {}, mobile: {} },
      reactions: [],
    }),
  );
  for (const [label, key, exists] of [
    ['布局', 'views', true],
    ['联动', 'reactions', false],
    ['校验', 'constraints', false],
  ] as const) {
    await page.getByRole('button', { name: label, exact: true }).click();
    if (exists) {
      await expect(page.getByText('/' + key, { exact: true })).toBeVisible();
      await page.getByRole('button', { name: '在 JSON 中编辑', exact: true }).click();
      await expect(page.locator('[data-json-path="/' + key + '"]:focus')).toHaveCount(1);
    } else {
      await expect(
        page.getByRole('heading', {
          name: label === '联动' ? '联动规则' : '校验规则',
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
    }
    await page.getByRole('button', { name: '返回' + label, exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: label === '联动' ? '联动规则' : exists ? label : '校验规则',
        exact: true,
      }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: '预览配置' }).click();
  await expect(page.getByRole('dialog', { name: '选择 Web 视图' })).toBeVisible();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '字段', exact: true }).click();
  for (const width of [1200, 390]) {
    await page.setViewportSize({ width, height: 720 });
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(
      721,
    );
  }
});
