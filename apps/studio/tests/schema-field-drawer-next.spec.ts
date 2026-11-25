import { expect, test } from '@playwright/test';
import {
  chooseSchemaOption,
  closeWorkbenchDrawer,
  openSchemaDraft,
  schemaSource,
} from './data-schema-fixture';

const original = String.raw`{"data":{"schema":{"type":"object","title":"投保资料","$defs":{"Person":{"type":"string","minLength":1},"Short":{"type":"string","maxLength":12}},"properties":{"trip":{"title":"行程类型","type":"string"},"passport":{"title":"护照号码","type":"string","minLength":6,"x-precision":9007199254740993},"invoice":{"title":"发票抬头","type":"string"},"tax":{"title":"税号","type":"string"},"contact":{"title":"联系人姓名","$ref":"#/$defs/Person","minLength":2}},"if":{"required":["trip"],"properties":{"trip":{"const":"境外"}}},"then":{"required":["passport"]},"dependentRequired":{"invoice":["tax"]}}},"views":{"x":-0}}`;

test('the single field drawer applies four sections as one change', async ({ page }) => {
  await openSchemaDraft(page, original);
  const open = page.getByRole('button', { name: '编辑 护照号码', exact: true });
  await expect(open).toBeVisible();
  await expect(page.getByRole('button', { name: '新版编辑 护照号码', exact: true })).toHaveCount(0);
  await open.focus();
  await open.press('Enter');
  const drawer = page.getByRole('dialog', { name: '字段配置 · 护照号码', exact: true });
  await expect(drawer).toBeVisible();
  expect((await drawer.boundingBox())?.width).toBe(640);
  await drawer.getByLabel('显示名称', { exact: true }).fill('旅行护照');
  await drawer.getByRole('combobox', { name: '数据类型' }).press('Enter');
  const types = page.getByRole('listbox');
  await expect(types).toBeVisible();
  await types.getByRole('option', { name: '空值' }).click();
  await page.keyboard.press('Escape');
  await drawer.getByLabel('最短长度', { exact: true }).fill('8');
  await drawer.getByLabel('始终必填').check();
  await drawer.getByText('高级属性', { exact: true }).click();
  await chooseSchemaOption(
    page,
    drawer.getByRole('combobox', { name: '已弃用', exact: true }),
    '否',
  );
  await drawer.getByRole('button', { name: 'JSON 编辑', exact: true }).click();
  await expect(drawer.getByRole('textbox', { name: '字段配置 JSON', exact: true })).toHaveValue(
    /9007199254740993/,
  );
  await drawer.getByRole('button', { name: '应用到工作台' }).click();
  await expect(drawer).toHaveCount(0);
  const source = await schemaSource(page);
  const saved = await source.inputValue();
  const schema = JSON.parse(saved).data.schema;
  expect(schema.properties.passport).toMatchObject({
    title: '旅行护照',
    type: ['string', 'null'],
    minLength: 8,
    deprecated: false,
  });
  expect(schema.required).toEqual(['passport']);
  expect(saved).toContain('"x-precision":9007199254740993');
  expect(saved).toContain('"views":{"x":-0}');
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(source).toHaveValue(original);
});

test('condition branches, dependency selectors, combinations and reference overrides work in the new drawer', async ({
  page,
}) => {
  await openSchemaDraft(page, original);
  await page.getByRole('button', { name: '编辑 护照号码', exact: true }).click();
  await page.getByRole('button', { name: '编辑所属对象' }).click();
  const owner = page.getByRole('dialog', { name: '字段配置 · 投保资料', exact: true });
  await owner.getByRole('button', { name: '编辑条件规则', exact: true }).click();
  const condition = page.getByRole('dialog', { name: '编辑条件规则', exact: true });
  await condition.getByRole('textbox', { name: /^匹配值/ }).fill('境外旅行');
  await condition.getByRole('button', { name: '添加否则分支' }).click();
  const alternative = condition.getByRole('group', { name: '否则 else', exact: true });
  await chooseSchemaOption(
    page,
    alternative.getByRole('combobox', { name: '子模型类型', exact: true }),
    '对象',
  );
  await alternative.getByLabel('子字段标识', { exact: true }).fill('tax');
  await alternative.getByRole('button', { name: '添加子字段标识' }).click();
  await alternative.getByLabel('此子字段必填').check();
  await alternative.getByLabel('最短长度', { exact: true }).fill('3');
  await condition.getByRole('button', { name: '保存规则' }).click();

  await owner.getByRole('button', { name: '编辑属性依赖', exact: true }).click();
  const dependency = page.getByRole('dialog', { name: '编辑属性依赖', exact: true });
  await dependency.getByRole('button', { name: '选择依赖字段' }).click();
  const picker = page.getByRole('dialog', { name: '选择依赖字段' });
  await picker.getByRole('treeitem', { name: /护照号码/ }).click();
  await picker.getByRole('button', { name: '应用选择' }).click();
  await dependency.getByRole('button', { name: '保存依赖', exact: true }).click();

  await chooseSchemaOption(page, owner.getByLabel('添加规则或约束'), '新增 allOf 分支');
  const combination = page.getByRole('dialog', { name: '新增组合分支' });
  await chooseSchemaOption(
    page,
    combination.getByRole('combobox', { name: '子模型类型', exact: true }),
    '对象',
  );
  await combination.getByLabel('子字段标识', { exact: true }).fill('tax');
  await combination.getByRole('button', { name: '添加子字段标识' }).click();
  await combination.getByLabel('最短长度', { exact: true }).fill('2');
  await combination.getByRole('button', { name: '保存规则' }).click();

  await owner.getByRole('button', { name: '应用到工作台' }).click();
  await expect(
    page.getByRole('dialog', { name: '字段配置 · 护照号码', exact: true }),
  ).toBeVisible();
  await closeWorkbenchDrawer(page);
  await page.getByRole('button', { name: '编辑 联系人姓名', exact: true }).click();
  const ref = page.getByRole('dialog', { name: '字段配置 · 联系人姓名', exact: true });
  await expect(ref.getByRole('region', { name: '校验属性', exact: true })).toBeHidden();
  await chooseSchemaOption(
    page,
    ref.getByRole('combobox', { name: '引用目标' }),
    /Short · #\/\$defs\/Short/,
  );
  await ref.getByRole('button', { name: /展开本字段覆盖/ }).click();
  await expect(ref.getByLabel('最短长度', { exact: true })).toHaveValue('2');
  await ref.getByRole('button', { name: '应用到工作台' }).click();

  const result = JSON.parse(await (await schemaSource(page)).inputValue()).data.schema;
  expect(result.if.properties.trip.const).toBe('境外旅行');
  expect(result.else).toMatchObject({ required: ['tax'], properties: { tax: { minLength: 3 } } });
  expect(result.dependentRequired.invoice).toEqual(['tax', 'passport']);
  expect(result.allOf[0].properties.tax.minLength).toBe(2);
  expect(result.properties.contact).toMatchObject({ $ref: '#/$defs/Short', minLength: 2 });
});

test('the new drawer guards local edits and restores keyboard focus', async ({ page }) => {
  await page.setViewportSize({ width: 520, height: 750 });
  await openSchemaDraft(page, original);
  const open = page.getByRole('button', { name: '编辑 护照号码', exact: true });
  await open.focus();
  await open.press('Enter');
  const drawer = page.getByRole('dialog', { name: '字段配置 · 护照号码', exact: true });
  expect((await drawer.boundingBox())?.width).toBe(520);
  await drawer.getByLabel('显示名称', { exact: true }).fill('暂存');
  await page.keyboard.press('Escape');
  const guard = page.getByRole('dialog', { name: '当前修改尚未应用' });
  await guard.getByRole('button', { name: '留在此处' }).click();
  await expect(drawer.getByLabel('显示名称', { exact: true })).toHaveValue('暂存');
  await page.keyboard.press('Escape');
  await guard.getByRole('button', { name: '放弃修改并继续' }).click();
  await expect(open).toBeFocused();
  await open.press('Enter');
  await expect(drawer.getByLabel('显示名称', { exact: true })).toHaveValue('护照号码');
});

test('the integrated rule types persist through Studio save and reopen', async ({ page }) => {
  await openSchemaDraft(page, original);
  await page.getByRole('button', { name: '编辑 投保资料', exact: true }).click();
  const owner = page.getByRole('dialog', { name: '字段配置 · 投保资料', exact: true });
  for (const key of ['anyOf', 'oneOf', 'not']) {
    await chooseSchemaOption(
      page,
      owner.getByLabel('添加规则或约束'),
      key === 'not' ? /取反 · not/ : '新增 ' + key + ' 分支',
    );
    const card = page.getByRole('dialog', { name: key === 'not' ? '新增取反' : '新增组合分支' });
    await chooseSchemaOption(
      page,
      card.getByRole('combobox', { name: '约束形式' }),
      key === 'not' ? '拒绝所有值' : '允许任何值',
    );
    await card.getByRole('button', { name: '保存规则' }).click();
  }
  await chooseSchemaOption(page, owner.getByLabel('添加规则或约束'), '新增依赖模型');
  const picker = page.getByRole('dialog', { name: '新增依赖模型', exact: true });
  await picker.getByLabel('触发字段名').fill('invoice');
  await picker.getByRole('button', { name: '继续配置约束' }).click();
  const dependent = picker;
  await chooseSchemaOption(
    page,
    dependent.getByRole('combobox', { name: '子模型类型', exact: true }),
    '对象',
  );
  await dependent.getByLabel('子字段标识', { exact: true }).fill('tax');
  await dependent.getByRole('button', { name: '添加子字段标识' }).click();
  await dependent.getByLabel('最短长度', { exact: true }).fill('3');
  await dependent.getByRole('button', { name: '保存规则' }).click();
  await owner.getByRole('button', { name: '应用到工作台' }).click();
  const saving = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/versions'),
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  expect((await saving).status()).toBe(201);
  await page.reload();
  await page.getByRole('button', { name: '字段', exact: true }).click();
  await page.getByRole('button', { name: '编辑 投保资料', exact: true }).click();
  await expect(owner.getByRole('region', { name: /anyOf/ })).toBeVisible();
  await expect(owner.getByRole('region', { name: /oneOf/ })).toBeVisible();
  await expect(owner.getByRole('region', { name: /not/ })).toBeVisible();
  const schema = JSON.parse(await (await schemaSource(page)).inputValue()).data.schema;
  expect(schema).toMatchObject({
    anyOf: [true],
    oneOf: [true],
    not: false,
    dependentSchemas: { invoice: { type: 'object', properties: { tax: { minLength: 3 } } } },
  });
});

test('a released version opens the new drawer in its structured read-only mode', async ({
  page,
}) => {
  await openSchemaDraft(
    page,
    JSON.stringify({
      protocolVersion: '1',
      id: 'readonly-schema-review',
      version: '1',
      data: {
        schema: {
          type: 'object',
          properties: { passport: { title: '护照号码', type: 'string', minLength: 6 } },
        },
      },
      views: { main: { material: 'section', props: { title: '字段验收' } } },
    }),
  );
  const saving = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/versions'),
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  expect((await saving).status()).toBe(201);
  await page.getByRole('button', { name: '返回版本列表', exact: true }).click();
  await page.getByRole('button', { name: '操作 模型草稿', exact: true }).click();
  await page.getByRole('menuitem', { name: '发布', exact: true }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  const row = page
    .getByRole('table', { name: '版本列表' })
    .getByRole('row')
    .filter({ hasText: '模型草稿' });
  await expect(row).toContainText('已发布');
  await row.locator('button.working-version-name').click();
  await page.getByRole('button', { name: '查看 护照号码', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: '字段配置 · 护照号码', exact: true });
  await expect(drawer.getByLabel('最短长度', { exact: true })).toHaveValue('6');
  await expect(drawer.getByLabel('最短长度', { exact: true })).toBeDisabled();
  await expect(drawer.getByRole('button', { name: '应用到工作台', exact: true })).toHaveCount(0);
});
