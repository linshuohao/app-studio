import { expect, test } from '@playwright/test';
import { openSchemaDraft, schemaSource } from './data-schema-fixture';

test('edits the declaring condition from a field, preserves untouched tokens and undoes branch changes', async ({
  page,
}) => {
  const source = String.raw`{"data":{"schema":{"type":"object","properties":{"trip":{"type":"string"},"passport":{"type":"string"}},"allOf":[{"if":{"properties":{"trip":{"const":"abroad","x-note":"\u0041"}},"required":["trip"]},"then":{"required":["passport"]},"x-precision":9007199254740993}]}},"views":{"x":-0}}`;
  await openSchemaDraft(page, source);
  const field = page.locator('[data-schema-path="/data/schema/properties/passport"]');
  await field.click();
  const flow = page.getByRole('region', {
    name: '来自所属对象的条件规则 / 全部满足 1',
    exact: true,
  });
  await expect(flow).toContainText('abroad');
  await flow.getByRole('button', { name: '编辑当', exact: true }).click();
  await flow.getByLabel('匹配值', { exact: true }).fill('overseas');
  await flow.getByRole('button', { name: '编辑成立时', exact: true }).click();
  const guard = page.getByRole('dialog', { name: '当前修改尚未应用' });
  await guard.getByRole('button', { name: '留在此处' }).click();
  await expect(flow.getByLabel('匹配值', { exact: true })).toHaveValue('overseas');
  await flow.getByRole('button', { name: '保存此项' }).click();
  await expect(field).toHaveAttribute('aria-pressed', 'true');
  const modified = source.replace('"abroad"', '"overseas"');
  await expect(await schemaSource(page)).toHaveValue(modified);

  await page.getByRole('button', { name: '字段', exact: true }).click();
  await field.click();
  await flow.getByRole('button', { name: '新增否则', exact: true }).click();
  let form = flow.getByRole('form', { name: '新增否则' });
  await form.getByLabel('新增约束类型').selectOption('required');
  await form.getByRole('button', { name: '添加一项' }).click();
  await form.getByLabel('必填字段', { exact: true }).fill('trip');
  await form.getByRole('button', { name: '添加必填字段' }).click();
  await form.getByRole('button', { name: '保存此项' }).click();
  await flow.getByRole('button', { name: '编辑否则' }).click();
  form = flow.getByRole('form', { name: '编辑否则' });
  await form.getByLabel('必填字段名').fill('passport');
  await form.getByRole('button', { name: '取消' }).click();
  await expect(flow.locator('.schema-rule-branch').last()).toContainText('必须填写 trip');
  await flow.getByRole('button', { name: '编辑否则' }).click();
  await form.getByLabel('必填字段名').fill('passport');
  await form.getByRole('button', { name: '保存此项' }).click();
  await expect(flow.locator('.schema-rule-branch').last()).toContainText('必须填写 passport');
  await flow.getByRole('button', { name: '删除否则' }).click();
  await flow
    .getByRole('form', { name: '删除否则' })
    .getByRole('button', { name: '保存此项' })
    .click();
  const raw = await schemaSource(page);
  await expect(raw).toHaveValue(modified);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  const result = await raw.inputValue();
  expect(JSON.parse(result).data.schema.allOf[0].else).toEqual({ required: ['passport'] });
  expect(result).toContain('9007199254740993');
  expect(result).toContain(String.raw`"x-note":"\u0041"`);
});

test('creates a combination and changes and removes property dependencies inside their card', async ({
  page,
}) => {
  await openSchemaDraft(
    page,
    '{"data":{"schema":{"type":"object","properties":{"trip":{},"passport":{}}}}}',
  );
  await page.locator('[data-schema-path="/data/schema"]').click();
  const rules = page.getByRole('region', { name: '条件与约束', exact: true });
  const add = rules.getByLabel('添加规则或约束');
  await add.selectOption('entry');
  await rules.getByLabel('字段名或属性名模式').fill('country');
  await add.selectOption('group');
  const guard = page.getByRole('dialog', { name: '当前修改尚未应用' });
  await guard.getByRole('button', { name: '留在此处' }).click();
  await expect(rules.getByLabel('字段名或属性名模式')).toHaveValue('country');
  await add.selectOption('condition');
  await guard.getByRole('button', { name: '放弃修改并继续' }).click();
  await rules
    .getByRole('form', { name: '新增条件规则' })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(rules.getByLabel('组合方式')).toHaveCount(0);
  await add.selectOption('condition');
  const condition = rules.getByRole('form', { name: '新增条件规则' });
  await expect(condition).toBeVisible();
  await condition.getByRole('button', { name: '取消', exact: true }).click();
  await add.selectOption('model');
  await expect(rules.getByRole('combobox', { name: '约束类型', exact: true })).toBeVisible();
  await rules.getByRole('button', { name: '取消', exact: true }).click();
  await expect(rules.getByRole('combobox', { name: '约束类型', exact: true })).toHaveCount(0);
  await add.selectOption('group');
  await expect(rules.getByLabel('映射类型')).toHaveCount(0);
  await rules.getByLabel('组合方式').selectOption('anyOf');
  await rules.getByRole('button', { name: '新增组合分支' }).click();
  let form = rules.getByRole('form', { name: '新增组合分支' });
  await form.getByLabel('约束形式').selectOption('false');
  await form.getByRole('button', { name: '保存此项' }).click();
  await expect(rules.getByRole('region', { name: '至少满足一项 · 分支 1' })).toContainText(
    '拒绝所有值',
  );
  await rules.getByLabel('添加规则或约束').selectOption('dependency');
  form = rules.getByRole('form', { name: '新增属性依赖' });
  await form.getByLabel('当属性出现').fill('trip');
  await form.getByLabel('需要的字段（每行一个）').fill('passport');
  await form.getByRole('button', { name: '保存此项' }).click();
  await rules.getByRole('button', { name: '编辑属性依赖' }).click();
  form = rules.getByRole('form', { name: '编辑属性依赖' });
  await form.getByLabel('当属性出现').fill('passport');
  await form.getByLabel('需要的字段（每行一个）').fill('trip');
  await form.getByRole('button', { name: '保存此项' }).click();
  await expect(rules).toContainText('当 passport 出现时，需要 trip');
  await rules.getByRole('button', { name: '删除属性依赖' }).click();
  await rules
    .getByRole('form', { name: '删除属性依赖' })
    .getByRole('button', { name: '保存此项' })
    .click();
  expect(JSON.parse(await (await schemaSource(page)).inputValue()).data.schema).toMatchObject({
    anyOf: [false],
    dependentRequired: {},
  });
});

test('adds, edits and removes prefix, pattern and dependency schemas on the selected owner', async ({
  page,
}) => {
  await openSchemaDraft(
    page,
    '{"data":{"schema":{"properties":{"owner":{"x-kept":9007199254740993}}}}}',
  );
  await page.locator('[data-schema-path="/data/schema/properties/owner"]').click();
  const rules = page.getByRole('region', { name: '条件与约束', exact: true });
  for (const [keyword, key, title] of [
    ['prefixItems', '', '前缀元素 · 分支 1'],
    ['patternProperties', '^x/', '模式属性 · ^x/'],
    ['dependentSchemas', 'plan~id', '依赖模型 · plan~id'],
  ]) {
    if (keyword === 'prefixItems') {
      await rules.getByLabel('添加规则或约束').selectOption('group');
      await rules.getByLabel('组合方式').selectOption(keyword);
      await rules.getByRole('button', { name: '新增组合分支' }).click();
    } else {
      await rules.getByLabel('添加规则或约束').selectOption('entry');
      await rules.getByLabel('映射类型').selectOption(keyword);
      await rules.getByLabel('字段名或属性名模式').fill(key);
      await rules.getByRole('button', { name: '新增映射约束' }).click();
    }
    let form = rules.getByRole('form');
    await form.getByLabel('约束形式').selectOption('false');
    await form.getByRole('button', { name: '保存此项' }).click();
    const card = rules.getByRole('region', { name: title, exact: true });
    await expect(card).toContainText('拒绝所有值');
    await card.getByRole('button', { name: '编辑' + title }).click();
    form = card.getByRole('form');
    await form.getByLabel('约束形式').selectOption('true');
    await form.getByRole('button', { name: '保存此项' }).click();
    await expect(card).toContainText('允许任何值');
    await card.getByRole('button', { name: '删除' + title }).click();
    await card.getByRole('form').getByRole('button', { name: '保存此项' }).click();
    await expect(card).toHaveCount(0);
  }
  const raw = await (await schemaSource(page)).inputValue();
  expect(raw).toContain('"x-kept":9007199254740993');
  expect(JSON.parse(raw).data.schema.properties.owner).toMatchObject({
    patternProperties: {},
    dependentSchemas: {},
  });
  expect(JSON.parse(raw).data.schema.properties.owner.prefixItems).toBeUndefined();
});

test('protects schema pointers when deleting an earlier tuple item or replacing a referenced subtree', async ({
  page,
}) => {
  const source =
    '{"data":{"schema":{"prefixItems":[{},{"type":"number"}],"$defs":{"alias":{"$ref":"#/prefixItems/1"}},"allOf":[{"properties":{"x":{}}}]}},"viewTemplates":{"t":{"params":{"p":{"schemaRef":"#/allOf/0/properties/x"}}}}}';
  await openSchemaDraft(page, source);
  await page.locator('[data-schema-path="/data/schema"]').click();
  const rules = page.getByRole('region', { name: '条件与约束', exact: true });
  await rules.getByRole('button', { name: '删除前缀元素 · 分支 1', exact: true }).click();
  await expect(rules.getByRole('alert')).toContainText('JSON');
  await rules.getByRole('button', { name: '编辑全部满足 · 分支 1', exact: true }).click();
  await rules.getByLabel('约束形式').first().selectOption('false');
  await expect(rules.getByRole('alert')).toContainText('JSON');
  await rules.getByRole('button', { name: '取消', exact: true }).click();
  await expect(await schemaSource(page)).toHaveValue(source);
});
