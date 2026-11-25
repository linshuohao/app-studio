import { expect, test, type Page } from '@playwright/test';
import { closeWorkbenchDrawer, openSchemaDraft, schemaSource } from './data-schema-fixture';
import { chooseWorkingVersionAction } from './working-version-menu';

const ref = (path: string) => ({ source: 'data', path });
const section = (title: string, nodes: unknown[] = []) => ({
  material: 'section',
  props: { title },
  slots: { default: nodes },
});
const city = {
  type: 'object',
  required: ['id', 'label'],
  additionalProperties: false,
  properties: { id: { type: 'string' }, label: { type: 'string' } },
};
const remote = {
  material: 'remote-select',
  props: { placeholder: '搜索城市', filterKey: 'CN' },
  bindings: { value: ref('/city') },
  requests: { search: { type: 'host.request', request: 'travel.searchCities' } },
};
const action = {
  material: 'button',
  props: { label: '存为草稿' },
  on: { activate: { type: 'host.emit', event: 'travel.saveDraft' } },
};
const panel = section('需要移动的分区', [remote, action]);
const grid = { material: 'grid', slots: { default: [] } };
const template = { $use: 'summary' };
const desktop = section('桌面入口', [panel, grid, template]);
const definition = {
  protocolVersion: '1',
  id: 'layout-browser-acceptance',
  version: 'draft',
  data: {
    schema: {
      type: 'object',
      properties: {
        city,
        note: { type: 'string' },
        until: { type: 'string' },
        passengers: {
          type: 'array',
          items: { type: 'object', properties: { name: { type: 'string' } } },
        },
      },
    },
  },
  views: { desktop },
  viewTemplates: {
    summary: {
      node: { material: 'value-display', props: { value: { $expr: { ref: ref('/note') } } } },
    },
  },
  metadata: { opaque: 'raw-token' },
};
const source = JSON.stringify(definition).replace(
  '"raw-token"',
  '{"decimal":1.200e+2,"escaped":"\\u0061"}',
);
const click = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();
const layoutSelect = (page: Page) => page.getByLabel('当前布局', { exact: true });
async function chooseOption(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
const layoutFields = (page: Page) => page.getByRole('tabpanel', { name: /^字段/ });
const outline = (page: Page) => page.getByRole('navigation', { name: '视图大纲' });
const materialDialog = (page: Page) => page.getByRole('dialog', { name: '选择布局物料' });
async function pickField(page: Page, label: string, path: string, scope = '表单根') {
  const picker = page.getByRole('dialog', { name: label, exact: true });
  await picker.getByRole('searchbox').fill(path);
  await expect(picker.getByText(scope, { exact: true })).toBeVisible();
  await picker.getByText(path, { exact: true }).click();
  await picker.getByRole('button', { name: '应用选择' }).click();
}

async function openLayout(page: Page, raw = source) {
  await openSchemaDraft(page, raw);
  await click(page, '布局');
  await expect(layoutSelect(page)).toBeVisible();
}
async function checkOrPreview(page: Page, mode: '检查' | '预览', profile: string, multiple = true) {
  await click(page, mode + '配置');
  if (multiple) {
    const picker = page.getByRole('dialog', { name: '选择 Web 视图' });
    await picker.getByRole('combobox').click();
    await page.getByRole('option', { name: profile, exact: true }).click();
    await click(page, mode === '检查' ? '开始检查' : '打开预览');
  }
  await expect(page.getByText('配置检查通过 · web / ' + profile, { exact: true })).toBeVisible();
}

test('copies a layout, moves a subtree, undoes the edit and reopens the saved working version', async ({
  page,
}) => {
  await openLayout(page);
  await click(page, '复制布局');
  await page.getByLabel('布局 key', { exact: true }).fill('mobile');
  await page.getByLabel('显示名称', { exact: true }).fill('移动表单');
  await click(page, '确认布局');
  await expect(layoutSelect(page)).toHaveText('移动表单 · mobile');
  await click(page, '修改名称');
  await page.getByLabel('显示名称', { exact: true }).fill('移动端');
  await click(page, '确认布局');
  await expect(layoutSelect(page)).toHaveText('移动端 · mobile');

  await outline(page)
    .getByRole('button', { name: /需要移动的分区/ })
    .click();
  await chooseOption(page, '移动到', 'grid · default · 第 1 位');
  await click(page, '移动节点');
  await expect(page.getByRole('button', { name: '移动节点', exact: true })).toBeHidden();
  const editor = await schemaSource(page);
  const moved = await editor.inputValue();
  const doc = JSON.parse(moved);
  expect(doc.views.mobile.slots.default).toEqual([
    { material: 'grid', slots: { default: [panel] } },
    template,
  ]);
  expect(doc.views.desktop).toEqual(desktop);
  expect(doc.viewTemplates).toEqual(definition.viewTemplates);
  expect(doc.data).toEqual(definition.data);
  expect(moved).toContain('"decimal":1.200e+2,"escaped":"\\u0061"');
  await click(page, '撤销');
  expect(JSON.parse(await editor.inputValue()).views.mobile).toEqual(desktop);
  await click(page, '重做');
  expect(await editor.inputValue()).toBe(moved);
  await checkOrPreview(page, '检查', 'mobile');
  await click(page, '关闭检查');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/versions') && r.request().method() === 'POST',
  );
  await click(page, '保存配置');
  expect((await saved).status()).toBe(201);
  await click(page, '返回版本列表');
  await page.reload();
  await chooseWorkingVersionAction(page, '编辑配置');
  await click(page, '布局');
  await chooseOption(page, '当前布局', '移动端 · mobile');
  await expect(layoutSelect(page)).toHaveText('移动端 · mobile');
  expect(JSON.parse(await (await schemaSource(page)).inputValue())).toEqual(doc);

  await checkOrPreview(page, '预览', 'mobile');
  const runtime = page.getByRole('region', { name: '受控预览' });
  await runtime.getByPlaceholder('搜索城市').fill('上海');
  await runtime.getByRole('button', { name: '搜索', exact: true }).click();
  await runtime.getByRole('button', { name: '上海市（模拟）', exact: true }).click();
  await runtime.getByRole('button', { name: '存为草稿', exact: true }).click();
  await expect(runtime.getByText('模拟保存草稿完成。')).toBeVisible();
});

test('inserts compatible material ports from the real catalog and cancels without changing the draft', async ({
  page,
}) => {
  await openLayout(page);
  await click(page, '编排');
  const add = page.getByRole('button', {
    name: '添加到 /views/desktop/slots/default 第 2 位',
    exact: true,
  });
  await add.click();
  const chooser = materialDialog(page);
  await chooser.getByLabel('搜索物料').fill('date-range');
  await chooser.getByRole('button', { name: '查看 date-range', exact: true }).click();
  await chooser.getByRole('button', { name: '取消', exact: true }).click();
  expect(await (await schemaSource(page)).inputValue()).toBe(source);
  await click(page, '布局');
  await click(page, '编排');
  await page.getByRole('tab', { name: /^字段/ }).click();
  await layoutFields(page).getByRole('button', { name: 'note', exact: true }).dragTo(add);
  await chooser.getByLabel('搜索物料').fill('date-range');
  await chooser.getByRole('button', { name: '查看 date-range', exact: true }).click();
  await chooser.getByLabel('属性 label', { exact: true }).fill('日期区间');
  const start = chooser.getByRole('button', { name: '绑定 start', exact: true });
  await expect(start).toHaveAccessibleDescription('/note');
  await chooser.getByRole('button', { name: '绑定 end', exact: true }).click();
  const fieldPicker = page.getByRole('dialog', { name: '绑定 end', exact: true });
  await expect(fieldPicker).toHaveCSS('border-top-color', 'rgb(222, 216, 234)');
  await expect(fieldPicker).toHaveCSS('padding', '0px');
  await expect(fieldPicker.getByRole('button', { name: '关闭' })).toHaveCSS('min-height', '30px');
  await expect(fieldPicker.getByRole('heading', { name: '绑定 end' })).toHaveCSS(
    'font-weight',
    '700',
  );
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: 375, height: 700 });
  await expect(fieldPicker.getByRole('searchbox')).toBeVisible();
  const narrow = (await fieldPicker.boundingBox())!;
  expect(narrow.x).toBeGreaterThan(0);
  expect(narrow.x + narrow.width).toBeLessThan(375);
  expect(await fieldPicker.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth)).toBe(
    true,
  );
  await expect(fieldPicker.getByRole('button', { name: '关闭' })).toHaveCSS('min-height', '30px');
  await page.setViewportSize(viewport);
  const incompatible = fieldPicker.getByRole('button', { name: /^city / }).first();
  await expect(incompatible).toBeDisabled();
  await incompatible.press('Enter');
  await expect(fieldPicker.getByRole('status')).toContainText('与此位置的要求不匹配');
  await expect(fieldPicker.getByRole('complementary', { name: '已选字段' })).toHaveCount(0);
  await fieldPicker.getByRole('searchbox').fill('/until');
  await fieldPicker.getByText('/until', { exact: true }).click();
  await fieldPicker.getByRole('button', { name: '取消', exact: true }).click();
  await expect(
    chooser.getByRole('button', { name: '绑定 end', exact: true }),
  ).toHaveAccessibleDescription('未选择字段');
  await chooser.getByRole('button', { name: '绑定 end', exact: true }).click();
  await pickField(page, '绑定 end', '/until');
  await chooser.getByRole('button', { name: '插入控件', exact: true }).click();
  await expect(chooser).toBeHidden();
  const doc = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(doc.views.desktop.slots.default.map((n: { material?: string }) => n.material)).toEqual([
    'section',
    'date-range',
    'grid',
    undefined,
  ]);
  expect(doc.views.desktop.slots.default[1]).toMatchObject({
    props: { label: '日期区间' },
    bindings: { start: ref('/note'), end: ref('/until') },
  });
  await click(page, '检查配置');
  await expect(page.getByText(/配置检查通过 · web/)).toBeVisible();
});

test('creates an independent empty root, rejects duplicate keys and updates field coverage when switching', async ({
  page,
}) => {
  await openLayout(page);
  await page.getByRole('tab', { name: /^字段/ }).click();
  const fields = layoutFields(page);
  const city = fields.getByRole('button', { name: 'city', exact: true });
  const note = fields.getByRole('button', { name: 'note', exact: true });
  await expect(city).toContainText('已关联');
  await expect(note).toContainText('未关联');
  await expect(fields.getByRole('button', { name: '数组元素', exact: true })).toBeVisible();
  await click(page, '新建布局');
  const modal = page.getByRole('dialog', { name: '新建布局' });
  await modal.getByLabel('布局 key').fill('desktop');
  await modal.getByLabel('显示名称').fill('自助表单');
  await modal.getByRole('button', { name: '确认布局' }).click();
  await expect(modal.getByRole('alert')).toContainText('已存在');
  await modal.getByLabel('布局 key').fill('self');
  await modal.getByRole('button', { name: '确认布局' }).click();
  await expect(layoutSelect(page)).toHaveText('自助表单 · self');
  await expect(city).toContainText('未关联');
  await click(page, '选择根容器');
  const chooser = materialDialog(page);
  await chooser.getByLabel('搜索物料').fill('grid');
  await chooser.getByRole('button', { name: '查看 grid', exact: true }).click();
  await chooser.getByRole('button', { name: '插入控件', exact: true }).click();
  await expect(chooser).toBeHidden();
  const saved = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(saved.views.self.material).toBe('grid');
  expect(saved.views.self).not.toHaveProperty('groups');
  expect(saved.views.self).not.toHaveProperty('density');
  expect(saved.views.desktop).toEqual(desktop);
});

test('blocks rebinding a subtree to a different collection with the same lexical alias and excludes descendants', async ({
  page,
}) => {
  const people = definition.data.schema.properties.passengers;
  const group = (list: string, title: string) => ({
    scope: { from: ref('/' + list), as: 'person', mode: 'each' },
    node: section(title, [
      section('成员资料', [
        {
          material: 'text-input',
          bindings: { value: { source: 'data', scope: 'person', path: '/name' } },
        },
      ]),
      grid,
    ]),
  });
  const raw = JSON.stringify({
    ...definition,
    data: { schema: { type: 'object', properties: { a: people, b: people } } },
    views: { desktop: section('人员', [group('a', '甲组'), group('b', '乙组')]) },
  });
  await openLayout(page, raw);
  const branch = '/views/desktop/slots/default/0/node';
  await outline(page)
    .locator('[data-node-path="' + branch + '/slots/default/0"]')
    .click();
  await page.getByRole('combobox', { name: '移动到', exact: true }).click();
  await expect(
    page.getByRole('option', { name: 'grid · default · 第 1 位', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('option', { name: /^乙组/ }).first()).toContainText('受限');
  await expect(page.getByRole('option', { name: /^人员 ·.*(?<!受限)$/ })).toHaveCount(0);
  await expect(
    page.getByRole('option', { name: '成员资料 · default · 第 1 位', exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press('Escape');
  expect(await (await schemaSource(page)).inputValue()).toBe(raw);
});

test('writes declared property expressions, Host events and requests through the inspector and runs the new mappings', async ({
  page,
}) => {
  const raw = JSON.stringify({
    ...definition,
    // Studio's travel preview supplies an initial plan value for the reactive property.
    id: 'family-travel',
    data: {
      schema: {
        type: 'object',
        properties: { ...definition.data.schema.properties, plan: { type: 'string' } },
      },
    },
    views: {
      desktop: section('表单', [
        { ...remote, requests: { search: { type: 'host.request', request: 'test.oldSearch' } } },
        { ...action, on: { activate: { type: 'host.emit', event: 'test.oldEvent' } } },
        {
          material: 'text-input',
          props: { placeholder: '输入地区' },
          bindings: { value: ref('/plan') },
        },
      ]),
    },
  });
  await openLayout(page, raw);
  const controls = page.getByRole('region', { name: '控件配置' });
  async function openSetting(name: string) {
    await controls.locator('summary').filter({ hasText: name }).click();
  }
  async function applySetting(name: string) {
    const button = page.getByRole('button', { name, exact: true });
    await button.click();
    await expect(button).toBeHidden();
  }
  await outline(page).getByRole('button', { name: 'remote-select' }).click();
  await openSetting('请求 search');
  await controls.getByLabel('Host 请求 search').fill('travel.searchCities');
  await applySetting('应用请求 search');
  await controls.getByLabel('属性 filterKey来源', { exact: true }).selectOption('field');
  await controls.getByRole('button', { name: '搜索筛选条件 · 读取字段', exact: true }).click();
  await pickField(page, '搜索筛选条件 · 读取字段', '/plan');
  await applySetting('应用属性');

  await closeWorkbenchDrawer(page);
  await outline(page)
    .getByRole('button', { name: /^存为草稿/ })
    .click();
  await openSetting('事件 activate');
  await controls.getByLabel('Host 事件 activate').fill('travel.saveDraft');
  await applySetting('应用事件 activate');
  const edited = JSON.parse(await (await schemaSource(page)).inputValue()).views.desktop.slots
    .default;
  expect(edited[0].requests).toEqual(remote.requests);
  expect(edited[0].props.filterKey).toEqual({ $expr: { ref: ref('/plan') } });
  expect(edited[1].on).toEqual(action.on);
  await click(page, '预览配置');
  const preview = page.getByRole('region', { name: '受控预览' });
  await preview.getByPlaceholder('输入地区').fill('CN');
  await preview.getByPlaceholder('搜索城市').fill('台北');
  await preview.getByRole('button', { name: '搜索', exact: true }).click();
  await preview.getByRole('button', { name: '台北市（模拟）', exact: true }).click();
  await preview.getByRole('button', { name: '存为草稿', exact: true }).click();
  await expect(preview.getByText('模拟保存草稿完成。')).toBeVisible();
});

test('keeps an incompatible expression out of the draft even when an unrelated diagnostic blocks compilation', async ({
  page,
}) => {
  const padding = ' '.repeat(17 * 1024);
  const raw = padding + source.replace('"protocolVersion":"1",', '') + padding;
  await openLayout(page, raw);
  await outline(page)
    .getByRole('button', { name: /^存为草稿/ })
    .click();
  const inspector = page.getByRole('region', { name: '控件配置' });
  await inspector.getByLabel('属性 disabled来源', { exact: true }).selectOption('expression');
  await inspector
    .getByLabel('属性 disabled协议 JSON', { exact: true })
    .fill('{"$expr":{"literal":"错误"}}');
  await click(page, '应用属性');
  await expect(inspector.getByRole('alert')).toContainText('控件未通过检查');
  await click(page, '还原');
  expect(await (await schemaSource(page)).inputValue()).toBe(raw);
});

test('preserves narrow outline scroll and selection while entering and leaving node details', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const sections = Array.from({ length: 35 }, (_, index) => section('第 ' + index + ' 分区'));
  await openLayout(
    page,
    JSON.stringify({ ...definition, views: { desktop: section('全部分区', sections) } }),
  );
  await page.getByRole('button', { name: '大纲', exact: true }).click();
  const target = outline(page).getByRole('button', { name: /^第 28 分区/ });
  const pane = page.locator('.layout-structure-panel:visible');
  await target.scrollIntoViewIfNeeded();
  const top = await pane.evaluate((el) => el.scrollTop);
  expect(top).toBeGreaterThan(0);
  await target.click();
  const detail = page.getByRole('dialog', { name: '第 28 分区', exact: true });
  await expect(detail.getByRole('heading', { name: '第 28 分区' })).toBeVisible();
  await closeWorkbenchDrawer(page);
  await expect(target).toBeFocused();
  await expect(target).toHaveAttribute('aria-pressed', 'true');
  expect(await pane.evaluate((el) => el.scrollTop)).toBe(top);
});

test('starts a root container in an empty working draft without adding data fields', async ({
  page,
}) => {
  await openLayout(page, '{}');
  await click(page, '新建布局');
  await expect(page.getByRole('dialog', { name: '新建布局' })).toHaveAttribute(
    'data-swipe-direction',
    'right',
  );
  await page.getByLabel('布局 key').fill('tablet');
  await page.getByLabel('显示名称').fill('平板');
  await click(page, '确认布局');
  await click(page, '选择根容器');
  const chooser = materialDialog(page);
  await chooser.getByLabel('搜索物料').fill('grid');
  await chooser.getByRole('button', { name: '查看 grid', exact: true }).click();
  await chooser.getByRole('button', { name: '插入控件', exact: true }).click();
  await expect(chooser).toBeHidden();
  const json = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(json.views.tablet).toMatchObject({ material: 'grid', slots: { default: [] } });
  expect(json).not.toHaveProperty('data');
});

test('configures travel repetition, trials a scoped visibility condition and keeps blocked moves out of the draft', async ({
  page,
}) => {
  const guardian = section('监护人信息', [
    { material: 'value-display', props: { value: '监护人资料' } },
  ]);
  const raw = JSON.stringify({
    ...definition,
    id: 'family-travel',
    viewTemplates: {},
    data: {
      schema: {
        type: 'object',
        properties: {
          insureds: {
            type: 'array',
            items: { type: 'object', properties: { age: { type: 'integer' } } },
          },
          days: { type: 'number' },
        },
      },
    },
    views: { desktop: section('旅险', [section('被保险人', [guardian]), section('投保人')]) },
  });
  await openLayout(page, raw);
  const repeated = '/views/desktop/slots/default/0';
  const guard = repeated + '/node/slots/default/0';
  await outline(page)
    .getByRole('button', { name: /^被保险人/ })
    .click();
  await click(page, '设置重复区');
  await click(page, '数据来源');
  await pickField(page, '数据来源', '/insureds');
  await page.getByLabel('成员作用域名称').fill('insured');
  await click(page, '应用数据范围');
  await expect(page.getByRole('dialog', { name: '数据范围', exact: true })).toBeHidden();
  await closeWorkbenchDrawer(page);
  await expect(outline(page).locator(`[data-node-path="${guard}"]`)).toBeVisible();

  await outline(page).locator(`[data-node-path="${guard}"]`).click();
  await click(page, '编辑显示条件');
  async function selectMemberAge() {
    const expression = page.getByRole('dialog', { name: '显示条件', exact: true });
    await expect(expression.getByRole('combobox', { name: '显示条件纯函数' })).toHaveText('小于');
    const field = page
      .locator('.expression-field')
      .filter({ has: page.getByRole('combobox', { name: '左侧值取值来源', exact: true }) })
      .last();
    const source = field.getByRole('combobox', { name: '左侧值取值来源', exact: true });
    await source.click();
    await page
      .getByRole('dialog', { name: '显示条件', exact: true })
      .getByRole('listbox')
      .getByRole('option', { name: '读取字段', exact: true })
      .click();
    await expect(source).toHaveText('读取字段');
    await field.getByRole('button', { name: '选择字段', exact: true }).click();
    const picker = page.locator('.picker-dialog');
    await picker.getByRole('searchbox').fill('/age');
    await picker.getByRole('radio', { name: /insured.*age/ }).check();
    await picker.getByRole('button', { name: '应用选择', exact: true }).click();
  }
  await selectMemberAge();
  await page.getByLabel('右侧值固定值', { exact: true }).fill('18');
  const operator = page.getByRole('combobox', { name: '显示条件纯函数', exact: true });
  await operator.click();
  const comparisonOption = page.getByRole('option', { name: '小于或等于', exact: true });
  await expect(comparisonOption).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(comparisonOption).toBeHidden();
  await expect(operator).toBeFocused();
  await click(page, '显示条件：验证表达式');
  const trialDialog = page.getByRole('dialog', { name: '验证表达式 · 显示条件' });
  const trial = trialDialog.getByRole('region', { name: '给定值验证' });
  const run = () => trialDialog.getByRole('button', { name: '运行验证' }).click();
  await trial.getByLabel(/样例 · .*age/).fill('16');
  await run();
  await expect(trial.getByRole('status')).toHaveText('条件成立 · 显示');
  await trial.getByLabel(/样例 · .*age/).fill('18');
  await run();
  await expect(trial.getByRole('status')).toHaveText('条件不成立 · 隐藏');
  await trial.getByLabel(/样例 · .*age/).fill('');
  await run();
  await expect(trial.getByRole('status')).toHaveText('缺少输入，无法得出结果。');
  await trialDialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page
    .getByRole('dialog', { name: '显示条件', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  const editor = await schemaSource(page);
  const before = await editor.inputValue();
  expect(JSON.parse(before).views.desktop.slots.default[0].node.slots.default).toEqual([guardian]);

  await click(page, '布局');
  await outline(page).locator(`[data-node-path="${guard}"]`).click();
  await click(page, '编辑显示条件');
  await selectMemberAge();
  await page.getByLabel('右侧值固定值', { exact: true }).fill('18');
  await click(page, '应用显示条件');
  await expect(page.getByRole('dialog', { name: '显示条件' })).toBeHidden();
  await chooseOption(page, '移动到', '投保人 · default · 第 1 位 · 受限');
  await expect(
    page
      .getByRole('region', { name: '节点设置' })
      .getByRole('status')
      .filter({ hasText: '作用域 insured' }),
  ).toContainText('作用域 insured · 字段 /age · 目标没有此作用域');
  await expect(page.getByRole('button', { name: '移动节点' })).toBeDisabled();
  await closeWorkbenchDrawer(page);
  await outline(page).locator(`[data-node-path="${repeated}"]`).click();
  await click(page, '编辑数据范围');
  await page.getByLabel('显示方式').click();
  await page.getByRole('option', { name: '整张表单显示一次', exact: true }).click();
  await click(page, '应用数据范围');
  await expect(page.getByRole('dialog', { name: '数据范围' }).getByRole('alert')).toContainText(
    '字段 /age',
  );
  await page
    .getByRole('dialog', { name: '数据范围', exact: true })
    .getByRole('button', { name: '关闭', exact: true })
    .click();

  const updated = await (await schemaSource(page)).inputValue();
  const scope = JSON.parse(updated).views.desktop.slots.default[0];
  expect(scope.scope).toEqual({ from: ref('/insureds'), as: 'insured', mode: 'each' });
  expect(scope.node.slots.default[0]).toEqual({
    material: 'condition',
    props: {
      visible: {
        $expr: {
          op: 'core.lt',
          args: [{ ref: { ...ref('/age'), scope: 'insured' } }, 18],
        },
      },
    },
    slots: { default: [guardian] },
  });
  await click(page, '撤销');
  expect(await editor.inputValue()).toBe(before);
  await click(page, '重做');
  await checkOrPreview(page, '检查', 'desktop', false);
  await click(page, '关闭检查');
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/versions') && r.request().method() === 'POST',
  );
  await click(page, '保存配置');
  expect((await saved).status()).toBe(201);
  await click(page, '返回版本列表');
  await page.reload();
  await chooseWorkingVersionAction(page, '编辑配置');
  expect(JSON.parse(await (await schemaSource(page)).inputValue())).toEqual(JSON.parse(updated));
  await checkOrPreview(page, '预览', 'desktop', false);
  const runtime = page.getByRole('region', { name: '受控预览' });
  await expect(runtime.getByText('被保险人', { exact: true })).toHaveCount(2);
  await expect(runtime.getByText('监护人信息', { exact: true })).toHaveCount(1);
});

test('renders the real form inline and keeps insertion lines compact in arrangement mode', async ({
  page,
}) => {
  await openLayout(page);
  const canvas = page.getByLabel('布局画布');
  const preview = canvas.getByRole('region', { name: '真实表单预览' });
  await expect(preview.getByRole('heading', { name: '桌面入口' })).toBeVisible();
  const input = preview.getByPlaceholder('搜索城市');
  await input.fill('上海');
  await preview.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(preview.getByRole('button', { name: '上海市（模拟）', exact: true })).toBeVisible();
  await expect(canvas.getByRole('button', { name: /^添加到 / })).toHaveCount(0);
  await click(page, '编排');
  const insertion = canvas.getByRole('button', {
    name: '添加到 /views/desktop/slots/default 第 1 位',
    exact: true,
  });
  await expect(insertion).toBeVisible();
  expect((await insertion.boundingBox())?.height).toBeLessThanOrEqual(16);
  await insertion.focus();
  await page.keyboard.press('Enter');
  await expect(materialDialog(page)).toBeVisible();
  await materialDialog(page).getByRole('button', { name: '取消', exact: true }).click();
  await click(page, '真实预览');
  await expect(preview.getByRole('heading', { name: '桌面入口' })).toBeVisible();
  expect(await (await schemaSource(page)).inputValue()).toBe(source);
});
