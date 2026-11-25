import { chooseWorkingVersionAction } from './working-version-menu';
import { expect, test } from '@playwright/test';
import { compactJson } from '../src/components/json/format';
import {
  chooseSchemaOption,
  closeWorkbenchDrawer,
  openSchemaDraft,
  schemaSource,
} from './data-schema-fixture';

const schema = '/data/schema';
const source = String.raw`{
  "data": {"schema":{"type":"object","properties":{"people":{"type":"array","items":{"type":"object","properties":{"age":{"type":"integer","minimum":1}}}}}}},
  "views":{"mobile":{"material":"section","slots":{"default":[]}}},
  "reactions":[{"id":"preserve","future":true}],"unknown":{"n":9007199254740993,"n":-0,"escape":"\u0061"}
}`;

test('keeps long field names on one line at regular density and opens a drawer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 900, height: 800 });
  const fieldName = '被保险人的境外紧急联络电话号码'.repeat(4);
  await openSchemaDraft(
    page,
    JSON.stringify({
      data: {
        schema: {
          type: 'object',
          properties: { [fieldName]: { type: 'string' } },
          required: [fieldName],
        },
      },
    }),
  );
  const tree = page.getByRole('tree', { name: '表单结构' });
  const root = tree.getByRole('button', { name: '根模型', exact: true });
  const field = tree.getByRole('button', { name: fieldName, exact: true });
  await expect(tree).toHaveAttribute('data-density', 'regular');
  await expect(field).toHaveCSS('white-space', 'nowrap');
  expect(
    await tree.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
      return el.scrollLeft;
    }),
  ).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);
  await root.focus();
  await page.keyboard.press('ArrowDown');
  await expect(field).toBeFocused();
  await expect(field).toContainText('文本 · 必填');
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: '字段配置 · ' + fieldName, exact: true });
  await expect(drawer).toBeVisible();
  await closeWorkbenchDrawer(page);
  await expect(field).toBeFocused();
  await expect(field).toHaveAttribute('aria-pressed', 'true');
});

test('edits a nested schema token, shares exact undo, saves and reopens the working version', async ({
  page,
}) => {
  await openSchemaDraft(page, source);
  const age = page.locator(
    '[data-schema-path="' + schema + '/properties/people/items/properties/age"]',
  );
  await age.click();
  await page.getByLabel('下限', { exact: true }).fill('18');
  await page.getByRole('button', { name: '应用到工作台', exact: true }).click();
  const expected = source.replace('"minimum":1', '"minimum":18');
  const input = await schemaSource(page);
  await expect(input).toHaveValue(expected);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(input).toHaveValue(source);
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await expect(input).toHaveValue(expected);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/versions') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON().text).toBe(compactJson(expected));
  await page.getByRole('button', { name: '返回版本列表', exact: true }).click();
  await chooseWorkingVersionAction(page, '编辑配置');
  await age.click();
  await expect(page.getByLabel('下限', { exact: true })).toHaveValue('18');
  expect(compactJson(await (await schemaSource(page)).inputValue())).toBe(compactJson(expected));
});

test('opens invalid text for repair and refuses ambiguous schema edits', async ({ page }) => {
  await openSchemaDraft(page, '{"data":{"schema":{"type":"object"},"schema":false}}');
  await page.locator('[data-schema-path="/data/schema"]').first().click();
  await expect(page.getByText(/该位置包含重复属性/)).toBeVisible();
  await (await schemaSource(page)).fill('{"data":');
  await page.getByRole('button', { name: '字段', exact: true }).click();
  await page.getByRole('button', { name: '打开文本修复', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '配置原文', exact: true })).toHaveValue(
    '{"data":',
  );
});

test('offers node actions by type, inserts in sibling order and guards deletion', async ({
  page,
}) => {
  const path = '/data/schema/properties/';
  await openSchemaDraft(
    page,
    JSON.stringify({
      data: {
        schema: {
          type: 'object',
          properties: {
            group: { type: 'object' },
            list: { type: 'array' },
            first: { type: 'integer' },
            last: {},
          },
        },
      },
    }),
  );
  const tree = page.getByRole('tree', { name: '表单结构' });
  const row = (name: string) => tree.getByRole('treeitem', { name, exact: true });
  await expect(row('group').getByRole('button', { name: '新增子字段 group' })).toBeVisible();
  await expect(row('list').getByRole('button', { name: '新增数组元素 list' })).toBeVisible();
  await expect(row('根模型').getByRole('button', { name: /删除/ })).toHaveCount(0);
  const insert = row('first').getByRole('button', { name: '插入同级字段 first' });
  await expect(row('first').getByRole('button', { name: '编辑 first', exact: true })).toBeVisible();
  await page.locator('[data-schema-path="' + path + 'first"]').focus();
  await page.keyboard.press('Tab');
  await expect(insert).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByLabel('字段名', { exact: true }).fill('second');
  await page.getByRole('button', { name: '确认新增' }).click();
  await expect(page.getByRole('dialog', { name: '字段配置 · second' })).toBeVisible();
  await closeWorkbenchDrawer(page);
  await expect(insert).toBeFocused();
  expect(
    await tree
      .getByRole('treeitem')
      .evaluateAll((rows) => rows.map((row) => row.getAttribute('aria-label'))),
  ).toEqual(['根模型', 'group', 'list', 'first', 'second', 'last']);
  await row('second').getByRole('button', { name: '删除字段 second' }).click();
  const confirm = page.getByRole('button', { name: '确认删除' });
  await expect(confirm).toBeVisible();
  await confirm.click();
  await closeWorkbenchDrawer(page);
  await expect(tree.getByRole('treeitem', { name: 'second' })).toHaveCount(0);
  await expect(page.locator('[data-schema-path="/data/schema"]')).toBeFocused();
});

test('builds an object array, removes its required integer and restores both with one undo', async ({
  page,
}) => {
  await openSchemaDraft(page, '{}');
  const click = (name: string) => page.getByRole('button', { name, exact: true }).click();
  await click('创建数据模型');
  async function add(name: string | undefined, type: string, action = '新增字段', close = true) {
    await click(action);
    if (name) await page.getByLabel('字段名', { exact: true }).fill(name);
    await chooseSchemaOption(
      page,
      page.getByLabel('节点类型', { exact: true }),
      new RegExp(' · ' + type + '$'),
    );
    await click('确认新增');
    if (close) await closeWorkbenchDrawer(page);
  }
  await add('名单', 'array');
  await add(undefined, 'object', '新增数组元素 名单');
  await add('年龄', 'integer', '新增子字段 数组元素', false);
  await page.getByLabel('下限', { exact: true }).fill('0');
  await page.getByRole('checkbox', { name: '始终必填' }).check();
  await click('应用到工作台');
  await closeWorkbenchDrawer(page);
  await page.getByRole('button', { name: '删除字段 年龄', exact: true }).click();
  await click('确认删除');
  const input = await schemaSource(page);
  const item = async () =>
    JSON.parse(await input.inputValue()).data.schema.properties['名单'].items;
  expect((await item()).properties?.['年龄']).toBeUndefined();
  expect((await item()).required ?? []).toEqual([]);
  await click('撤销');
  expect(await item()).toMatchObject({
    properties: { 年龄: { type: 'integer', minimum: 0 } },
    required: ['年龄'],
  });
});

test('switches a single local reference and lists direct and array uses from a shared child', async ({
  page,
}) => {
  const fixture = {
    data: {
      schema: {
        $defs: {
          Person: { type: 'object', properties: { name: { type: 'string', minLength: 1 } } },
          Other: { type: 'object' },
        },
        properties: {
          contact: { $ref: '#/$defs/Person', 'x-local': true },
          roster: { type: 'array', items: { $ref: '#/$defs/Person' } },
          alternate: { $ref: '#/$defs/Other', maxProperties: 2 },
        },
      },
    },
  };
  await openSchemaDraft(page, JSON.stringify(fixture));
  const pick = (p: string) => page.locator('[data-schema-path="' + schema + p + '"]').click();
  await pick('/properties/alternate');
  await chooseSchemaOption(
    page,
    page.getByRole('combobox', { name: '引用目标' }),
    /Person · #\/\$defs\/Person/,
  );
  await page.getByRole('button', { name: '应用到工作台', exact: true }).click();
  await page.getByRole('button', { name: '收起根模型', exact: true }).click();
  await pick('/$defs/Person/properties/name');
  await closeWorkbenchDrawer(page);
  await expect(page.getByRole('button', { name: '展开根模型', exact: true })).toBeVisible();
  await pick('/$defs/Person/properties/name');
  const uses = page.getByRole('region', { name: '共享定义使用位置' });
  const impactSummary = uses.getByText('共享定义「Person」 · 已知影响 3 处');
  await expect(uses.getByRole('button', { name: '数组「roster」的元素' })).toBeHidden();
  await impactSummary.click();
  for (const label of ['字段「contact」', '数组「roster」的元素', '字段「alternate」'])
    await expect(uses.getByRole('button', { name: label, exact: true })).toBeVisible();
  await expect(uses.getByText(schema + '/properties/roster/items')).toBeVisible();
  await page.getByLabel('最短长度', { exact: true }).fill('3');
  await page.getByRole('button', { name: '应用到工作台', exact: true }).click();
  fixture.data.schema.$defs.Person.properties.name.minLength = 3;
  fixture.data.schema.properties.alternate.$ref = '#/$defs/Person';
  expect(JSON.parse(await (await schemaSource(page)).inputValue())).toEqual(fixture);
});

test('returns to the selected array field in the narrow outline', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openSchemaDraft(page, source);
  const field = page.locator(
    '[data-schema-path="/data/schema/properties/people/items/properties/age"]',
  );
  await field.click();
  await expect(page.getByLabel('下限', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await closeWorkbenchDrawer(page);
  await expect(field).toHaveAttribute('aria-pressed', 'true');
});

test('keeps a referenced definition when the author attempts deletion and exposes its template consumer', async ({
  page,
}) => {
  const original =
    '{"data":{"schema":{"$defs":{"Person":{"type":"object"}}}},"viewTemplates":{"card":{"params":{"person":{"schemaRef":"#/$defs/Person"}}}}}';
  await openSchemaDraft(page, original);
  await page.locator('[data-schema-path="/data/schema/$defs/Person"]').click();
  const uses = page.getByRole('region', { name: '共享定义使用位置' });
  await uses.getByText('共享定义「Person」 · 已知影响 1 处').click();
  await expect(uses.getByRole('button', { name: '模板「card」的参数「person」' })).toBeVisible();
  await expect(uses.getByText('/viewTemplates/card/params/person/schemaRef')).toBeVisible();
  await closeWorkbenchDrawer(page);
  await page.getByRole('button', { name: '删除定义 Person', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认删除', exact: true })).toBeDisabled();
  await expect(page.getByText('此操作涉及使用位置，请在 JSON 中核对后编辑。')).toBeVisible();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(await schemaSource(page)).toHaveValue(original);
});

test('explains format and previews regex drafts without saving examples', async ({ page }) => {
  await openSchemaDraft(
    page,
    '{"data":{"schema":{"properties":{"zip":{"type":"string","format":"custom"}}}}}',
  );
  await page.locator('[data-schema-path="/data/schema/properties/zip"]').click();
  await page.getByText(/^高级属性/).click();
  await expect(page.getByLabel('格式名称', { exact: true })).toHaveAccessibleDescription(
    /当前引擎不会用它校验字段值/,
  );
  await page.getByText(/^更多校验/).click();
  const pattern = page.getByLabel('正则匹配', { exact: true });
  await expect(pattern).toHaveAccessibleDescription(/例如.*6.*位数字/);
  await pattern.fill('[');
  await page.getByText('试样例', { exact: true }).click();
  const testMatch = page.getByRole('button', { name: '测试匹配' });
  await testMatch.click();
  await expect(page.getByText(/正则语法有误/)).toBeVisible();
  await page.getByText('正则模板', { exact: true }).click();
  const template = page.getByLabel('正则模板', { exact: true });
  await template.selectOption('prefix');
  await page.getByLabel('开头文本', { exact: true }).fill('ORD.');
  await expect(page.getByText(String.raw`^ORD\.`, { exact: true })).toBeVisible();
  await template.selectOption('letters');
  await expect(page.getByText('^[A-Za-z]{6}$', { exact: true })).toBeVisible();
  await template.selectOption('digits');
  await page.getByLabel('字符个数', { exact: true }).fill('6');
  await expect(pattern).toHaveValue('[');
  await page.getByRole('button', { name: '替换当前表达式' }).click();
  await expect(pattern).toHaveValue('^[0-9]{6}$');
  const sample = page.getByLabel('样例文本', { exact: true });
  await sample.fill('012345');
  await testMatch.click();
  await expect(page.getByText('匹配', { exact: true })).toBeVisible();
  await sample.fill('0123456');
  await testMatch.click();
  await expect(page.getByText('不匹配', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '应用到工作台' }).click();
  const source = await schemaSource(page);
  expect(JSON.parse(await source.inputValue()).data.schema.properties.zip).toEqual({
    type: 'string',
    format: 'custom',
    pattern: '^[0-9]{6}$',
  });
});
