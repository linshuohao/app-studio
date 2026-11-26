import { expect, test } from '@playwright/test';
import { chooseSchemaOption, openSchemaDraft, schemaSource } from './data-schema-fixture';

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
  const drawer = page.getByRole('dialog', { name: '字段配置 · age', exact: true });
  await drawer.getByRole('button', { name: 'JSON 编辑', exact: true }).click();
  const nodeSource = drawer.getByRole('textbox', { name: '字段配置 JSON', exact: true });
  await nodeSource.fill('{"type":');
  await click('在 JSON 中定位');
  await click('应用并继续');
  await expect(nodeSource).toHaveValue('{"type":');
  await expect(drawer.getByText('请先修正字段 JSON。', { exact: true })).toBeVisible();
  await nodeSource.fill('{"type":"integer","minimum":7}');
  await page.keyboard.press('Escape');
  await click('留在此处');
  await expect(nodeSource).toHaveValue('{"type":"integer","minimum":7}');
  await click('在 JSON 中定位');
  await click('应用并继续');
  const fragment = page.getByRole('dialog', { name: '编辑局部 JSON', exact: true });
  expect(
    JSON.parse(await fragment.getByRole('textbox', { name: '局部 JSON' }).inputValue()),
  ).toEqual({ type: 'integer', minimum: 7 });
  await fragment.getByRole('textbox', { name: '局部 JSON' }).fill('{"type":"integer","minimum":9}');
  await fragment.getByRole('button', { name: '应用 JSON', exact: true }).click();
  await expect(fragment).toHaveCount(0);
  const source = await schemaSource(page);
  const expected = structuredClone(fixture);
  expected.data.schema.properties.insured.properties.age.minimum = 9;
  expect(JSON.parse(await source.inputValue())).toEqual(expected);
  await click('撤销');
  expect(
    JSON.parse(await source.inputValue()).data.schema.properties.insured.properties.age.minimum,
  ).toBe(7);
  await click('撤销');
  expect(JSON.parse(await source.inputValue())).toEqual(fixture);
  await click('字段');
  await select(age);
  const minimum = drawer.getByLabel('下限', { exact: true });
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
  const fragment = page.getByRole('dialog', { name: '编辑局部 JSON', exact: true });
  await expect(fragment.getByRole('textbox', { name: '局部 JSON' })).toBeVisible();
  await fragment.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '字段配置 · age', exact: true })).toBeVisible();
  expect(await outline.evaluate((el) => el.scrollTop)).toBe(before);
  await expect(outline.locator('button[aria-label="展开extra"]')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await page.setViewportSize({ width: 390, height: 780 });
  const editor = await schemaSource(page);
  const changed = JSON.parse(source);
  delete changed.data.schema.properties.insured.properties.age;
  await editor.fill(JSON.stringify(changed));
  await page.getByRole('button', { name: '字段', exact: true }).click();
  await expect(page.locator('[data-schema-path="' + group + '"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('isolates field and rule edits from the workspace until the drawer is applied', async ({
  page,
}) => {
  await openSchemaDraft(page, JSON.stringify(fixture));
  await page.locator('[data-schema-path="' + age + '"]').click();
  const drawer = page.getByRole('dialog', { name: '字段配置 · age', exact: true });
  const minimum = drawer.getByLabel('下限', { exact: true });
  await minimum.fill('7');
  await expect(page.locator('button.workspace-save')).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '留在此处', exact: true }).click();
  await expect(minimum).toHaveValue('7');

  const apply = drawer.getByRole('button', { name: '应用到工作台', exact: true });
  await chooseSchemaOption(
    page,
    drawer.getByRole('combobox', { name: '添加规则或约束' }),
    '新增 anyOf 分支',
  );
  const rule = page.getByRole('dialog', { name: '新增组合分支', exact: true });
  await expect(minimum).toBeDisabled();
  await expect(apply).toBeDisabled();
  await expect(page.locator('button.workspace-save')).toBeDisabled();
  await rule.getByRole('button', { name: '取消', exact: true }).click();
  await expect(minimum).toBeEnabled();
  await expect(minimum).toHaveValue('7');
  await apply.click();
  const output = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(output.data.schema.properties.insured.properties.age).toEqual({
    type: 'integer',
    minimum: 7,
  });
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
      await page.getByRole('button', { name: '在 JSON 中编辑', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '编辑局部 JSON' });
      await expect(dialog.getByText('/' + key + '/desktop', { exact: true })).toBeVisible();
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    } else {
      await expect(
        page.getByRole('heading', {
          name: label === '联动' ? '联动规则' : '校验规则',
          exact: true,
        }),
      ).toBeVisible();
    }
    await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
    await page.getByRole('button', { name: '返回' + label, exact: true }).click();
    const moduleView = exists
      ? page.getByRole('region', { name: '布局编辑器', exact: true })
      : page.getByRole('heading', {
          name: label === '联动' ? '联动规则' : '校验规则',
          exact: true,
        });
    await expect(moduleView).toBeVisible();
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
