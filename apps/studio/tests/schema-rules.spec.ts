import { expect, test, type Page } from '@playwright/test';
import { chooseSchemaOption, openSchemaDraft, schemaSource } from './data-schema-fixture';

const saveRule = (page: Page) =>
  page.getByRole('button', { name: '保存规则', exact: true }).click();
const applyOwner = (page: Page) =>
  page.getByRole('button', { name: '应用到工作台', exact: true }).click();

async function chooseFields(page: Page, title: string, paths: RegExp[]) {
  await page.getByRole('button', { name: title, exact: true }).click();
  const picker = page.getByRole('dialog', { name: title, exact: true });
  for (const path of paths) await picker.getByRole('treeitem', { name: path }).click();
  await picker.getByRole('button', { name: '应用选择', exact: true }).click();
}

test('edits the declaring condition from a field, preserves untouched tokens and undoes branch changes', async ({
  page,
}) => {
  const source = String.raw`{"data":{"schema":{"type":"object","properties":{"trip":{"type":"string"},"passport":{"type":"string"}},"allOf":[{"if":{"properties":{"trip":{"const":"abroad","x-note":"\u0041"}},"required":["trip"]},"then":{"required":["passport"]},"x-precision":9007199254740993}]}},"views":{"x":-0}}`;
  await openSchemaDraft(page, source);
  const field = page.locator('[data-schema-path="/data/schema/properties/passport"]');
  await field.click();
  const related = page.getByRole('region', {
    name: '来自所属对象的条件规则 / 全部满足 1',
    exact: true,
  });
  await expect(related).toContainText('abroad');
  await related.getByRole('button', { name: '编辑所属对象', exact: true }).click();
  const owner = page.getByRole('dialog', { name: '字段配置 · 根模型', exact: true });
  const branch = owner.getByRole('region', { name: '分支条件规则', exact: true });
  const edit = branch.getByRole('button', { name: '编辑条件规则', exact: true });
  await edit.click();
  const rule = page.getByRole('dialog', { name: '编辑条件规则', exact: true });
  await rule.getByRole('button', { name: 'JSON 编辑', exact: true }).click();
  const condition = rule.getByRole('textbox', { name: '编辑条件规则 JSON', exact: true });
  const originalRule = await condition.inputValue();
  await condition.fill(originalRule.replace('"abroad"', '"overseas"'));
  await saveRule(page);
  await applyOwner(page);
  await expect(related).toContainText('overseas');
  const modified = await (await schemaSource(page)).inputValue();
  expect(modified).toContain('"overseas"');
  expect(modified).toContain(String.raw`"x-note":"\u0041"`);
  expect(modified).toContain('9007199254740993');
  expect(modified).toContain('"views":{"x":-0}');

  await page.getByRole('button', { name: '字段', exact: true }).click();
  await field.click();
  await related.getByRole('button', { name: '编辑所属对象', exact: true }).click();
  await edit.click();
  await rule.getByRole('button', { name: '添加否则分支', exact: true }).click();
  await chooseFields(page, '选择必填字段', [/trip/]);
  await saveRule(page);
  await expect(branch.locator('.schema-rule-branch').last()).toContainText('必须填写 trip');
  await edit.click();
  const alternate = rule.getByRole('group', { name: '否则 else', exact: true });
  await alternate.getByText(/^必填字段/).click();
  await chooseFields(page, '选择必填字段', [/trip/, /passport/]);
  await rule
    .locator(':scope > .toolbar')
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await expect(branch.locator('.schema-rule-branch').last()).toContainText('必须填写 trip');
  await edit.click();
  await alternate.getByText(/^必填字段/).click();
  await chooseFields(page, '选择必填字段', [/trip/, /passport/]);
  await saveRule(page);
  await applyOwner(page);
  const withElse = await (await schemaSource(page)).inputValue();
  expect(JSON.parse(withElse).data.schema.allOf[0].else).toEqual({ required: ['passport'] });

  await page.getByRole('button', { name: '字段', exact: true }).click();
  await field.click();
  await related.getByRole('button', { name: '编辑所属对象', exact: true }).click();
  await edit.click();
  await rule.getByRole('button', { name: '移除否则分支', exact: true }).click();
  await saveRule(page);
  await applyOwner(page);
  const raw = await schemaSource(page);
  expect(JSON.parse(await raw.inputValue()).data.schema.allOf[0].else).toBeUndefined();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(raw).toHaveValue(withElse);
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
  const add = rules.getByRole('combobox', { name: '添加规则或约束' });
  await chooseSchemaOption(page, add, '新增属性名模式约束');
  const pattern = page.getByRole('dialog', { name: '新增属性名模式约束', exact: true });
  await pattern.getByLabel('属性名模式').fill('country');
  await pattern.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(pattern).toHaveCount(0);

  await chooseSchemaOption(page, add, '条件规则');
  const condition = page.getByRole('dialog', { name: '新增条件规则', exact: true });
  await expect(condition).toBeVisible();
  await condition.getByRole('button', { name: '取消', exact: true }).click();
  await chooseSchemaOption(page, add, '新增 anyOf 分支');
  const combination = page.getByRole('dialog', { name: '新增组合分支', exact: true });
  await chooseSchemaOption(page, combination.getByLabel('约束形式'), '拒绝所有值');
  await saveRule(page);
  await expect(rules.getByRole('region', { name: '至少满足一项 · anyOf · 分支 1' })).toContainText(
    '拒绝所有值',
  );

  await chooseSchemaOption(page, add, '属性依赖');
  await chooseFields(page, '选择触发字段', [/trip/]);
  await chooseFields(page, '选择依赖字段', [/passport/]);
  await page.getByRole('button', { name: '保存依赖', exact: true }).click();
  await rules.getByRole('button', { name: '编辑属性依赖' }).click();
  await chooseFields(page, '选择触发字段', [/passport/]);
  await chooseFields(page, '选择依赖字段', [/passport/, /trip/]);
  await page.getByRole('button', { name: '保存依赖', exact: true }).click();
  await expect(rules).toContainText('当 passport 出现时，需要 trip');
  await rules.getByRole('button', { name: '删除属性依赖' }).click();
  await rules
    .getByRole('form', { name: '删除属性依赖' })
    .getByRole('button', { name: '保存此项' })
    .click();
  await applyOwner(page);
  const schema = JSON.parse(await (await schemaSource(page)).inputValue()).data.schema;
  expect(schema).toMatchObject({ anyOf: [false], dependentRequired: {} });
  expect(schema).not.toHaveProperty('if');
  expect(schema).not.toHaveProperty('patternProperties');
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
  for (const [option, key, title] of [
    ['新增 prefixItems 分支', '', '前缀元素 · prefixItems · 分支 1'],
    ['新增属性名模式约束', '^x/', '模式属性 · ^x/'],
    ['新增依赖模型', 'plan~id', '依赖模型 · plan~id'],
  ]) {
    await chooseSchemaOption(page, rules.getByRole('combobox', { name: '添加规则或约束' }), option);
    if (key) {
      const dialog = page.getByRole('dialog', { name: option, exact: true });
      await dialog.getByLabel(option === '新增依赖模型' ? '触发字段名' : '属性名模式').fill(key);
      await dialog.getByRole('button', { name: '继续配置约束' }).click();
    }
    await chooseSchemaOption(page, page.getByRole('combobox', { name: '约束形式' }), '拒绝所有值');
    await saveRule(page);
    const card = rules.getByRole('region', { name: title, exact: true });
    await expect(card).toContainText('拒绝所有值');
    await card.getByRole('button', { name: '编辑' + title, exact: true }).click();
    await chooseSchemaOption(page, page.getByRole('combobox', { name: '约束形式' }), '允许任何值');
    await saveRule(page);
    await expect(card).toContainText('允许任何值');
    await card.getByRole('button', { name: '删除' + title, exact: true }).click();
    await card.getByRole('form').getByRole('button', { name: '保存此项' }).click();
    await expect(card).toHaveCount(0);
  }
  await applyOwner(page);
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
  await rules
    .getByRole('button', { name: '删除前缀元素 · prefixItems · 分支 1', exact: true })
    .click();
  await expect(rules.getByRole('alert')).toContainText('JSON');
  await rules.getByRole('button', { name: '编辑全部满足 · allOf · 分支 1', exact: true }).click();
  const rule = page.getByRole('dialog', { name: '编辑全部满足 · allOf · 分支 1', exact: true });
  await chooseSchemaOption(
    page,
    rule.getByRole('combobox', { name: '约束形式', exact: true }),
    '拒绝所有值',
  );
  await expect(rule.getByRole('alert')).toContainText('JSON');
  await rule.getByRole('button', { name: '取消', exact: true }).click();
  await expect(await schemaSource(page)).toHaveValue(source);
});
