import { chooseWorkingVersionAction } from './working-version-menu';
import { expect, test, type Page } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';
import { goldenData, ratePolicy } from '../../playground/src/demos/travel/policy';
import { compactJson } from '../src/app/format-json';
import { openSchemaDraft, schemaSource } from './data-schema-fixture';

const data = (path: string, scope?: string) => ({
  source: 'data' as const,
  path,
  ...(scope && { scope }),
});
const read = (path: string, scope?: string) => ({ ref: data(path, scope) });
const set = (path: string, value: unknown, scope?: string) => ({
  op: 'set',
  target: data(path, scope),
  value,
});
const button = (label: string, command: unknown) => ({
  material: 'button',
  props: { label },
  on: { activate: { type: 'form.command', command } },
});
const numeric = (path: string, placeholder: string, scope?: string, readOnly = false) => ({
  material: 'number-input',
  bindings: { value: data(path, scope) },
  props: { placeholder, readOnly },
});
const alias = 'traveller';
const binders = [
  { mode: 'one', as: 'policyForm', from: data('') },
  { mode: 'each', as: alias, from: data('/insureds', 'policyForm') },
];
const compute = set(
  '/premium',
  {
    $expr: {
      op: 'travel.personPremium',
      args: [read('/age', alias), read('/plan'), read('/days'), read('/rates')],
    },
  },
  alias,
);
const recordAge = set('/lastRootAge', { $expr: read('/age') }, alias);
const rule = {
  id: 'member-premium',
  scope: binders,
  watch: [data('/age', alias)],
  when: { use: 'enabled' },
  then: [recordAge, compute],
};
const opaque = {
  id: 'handle-rule',
  scope: binders,
  watch: [data('/age', alias)],
  when: false,
  then: [
    {
      op: 'array.move',
      target: data('/insureds'),
      item: { $scope: alias },
      position: { kind: 'index', index: 0 },
    },
  ],
};
const members = [
  { name: '甲', age: 29, premium: 11, lastRootAge: -1 },
  { name: '乙', age: 12, premium: 22, lastRootAge: -1 },
];
const initial = { age: 10, days: 2, plan: 'basic', rates: ratePolicy, insureds: members };
const int = { type: 'integer' };
const person = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: int,
    premium: { type: ['integer', 'null'] },
    lastRootAge: int,
  },
};
const definition = {
  id: 'reaction-acceptance',
  version: 'draft',
  protocolVersion: '1',
  data: {
    schema: {
      type: 'object',
      properties: {
        age: int,
        days: int,
        plan: { type: 'string' },
        rates: { type: 'object' },
        insureds: { type: 'array', items: person },
      },
    },
  },
  expressions: { enabled: true },
  reactions: [opaque],
  views: {
    desktop: {
      material: 'section',
      props: { title: '联动验收表单' },
      slots: {
        default: [
          button('录入两位被保人', {
            op: 'batch',
            commands: Object.entries(initial).map(([key, value]) =>
              set('/' + key, { $literal: value }),
            ),
          }),
          numeric('/age', '根年龄'),
          numeric('/days', '根天数'),
          {
            scope: { from: data('/insureds'), as: 'row', mode: 'each' },
            node: {
              material: 'section',
              props: { title: { $expr: read('/name', 'row') } },
              slots: {
                default: [
                  numeric('/age', '成员年龄', 'row'),
                  numeric('/premium', '成员保费', 'row', true),
                  numeric('/lastRootAge', '执行时的根年龄', 'row', true),
                  button('移到首位', {
                    op: 'array.move',
                    target: data('/insureds'),
                    item: { $scope: 'row' },
                    position: { kind: 'index', index: 0 },
                  }),
                  button('移除', {
                    op: 'array.remove',
                    target: data('/insureds'),
                    item: { $scope: 'row' },
                  }),
                ],
              },
            },
          },
        ],
      },
    },
  },
  metadata: { escaped: 'raw-token' },
};
const source = () => JSON.stringify(definition).replace('"raw-token"', '"\\u0061"');
test.beforeAll(async () => {
  const { travelPersonPremiumManifest } = await import('@form-engine/pure-functions/manifests');
  definition.data.schema.properties.rates = travelPersonPremiumManifest.parameters[3].schema as {
    type: string;
  };
});

const click = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).click();

async function selectOption(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}
async function selectTarget(page: Page, label: string, path: string, scope?: string) {
  await click(page, label);
  const dialog = page.getByRole('dialog', { name: label, exact: true });
  await dialog.getByRole('searchbox').fill(path);
  const options = dialog.getByRole('radio', { disabled: false });
  const option = scope
    ? dialog.getByRole('radio', { name: scope + ' / ' + path.slice(1), exact: true })
    : options.last();
  await option.check();
  await dialog.getByRole('button', { name: '应用选择' }).click();
}
async function preview(page: Page) {
  await click(page, '预览配置');
  const region = page.getByRole('region', { name: '受控预览' });
  await region.getByRole('button', { name: '录入两位被保人' }).click();
  return {
    region,
    a: region.getByRole('region', { name: '甲', exact: true }),
    b: region.getByRole('region', { name: '乙', exact: true }),
  };
}

test('authors an ordered scoped reaction, reopens it, and isolates member writes across moves and removal', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1920, height: 1000 });
  await openSchemaDraft(page, source());
  await click(page, '联动');
  await click(page, '添加联动');
  await page.getByLabel('规则名称', { exact: true }).fill(rule.id);
  const drawer = page.getByRole('dialog', { name: '添加联动', exact: true });
  await drawer.getByRole('tab', { name: 'JSON 编辑' }).click();
  await drawer
    .getByRole('textbox', { name: '规则 JSON' })
    .fill(JSON.stringify({ ...rule, then: [recordAge] }));
  await drawer.getByRole('tab', { name: '表单编辑' }).click();
  await click(page, '添加动作');
  await selectTarget(page, '选择目标字段', '/premium', alias);
  await page.getByRole('combobox', { name: '写入值取值来源', exact: true }).click();
  await page.getByRole('option', { name: '函数结果', exact: true }).click();
  const fn = page.getByRole('combobox', { name: '写入值纯函数', exact: true });
  await expect(page.getByRole('combobox', { name: '写入值取值来源', exact: true })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await fn.press('ArrowDown');
  await page.getByRole('option', { name: '计算单人保费', exact: true }).click({ timeout: 5000 });
  const actionDialog = page.getByRole('dialog', { name: /^(添加|编辑)动作$/ });
  const info = actionDialog.getByRole('button', { name: '写入值函数说明', exact: true });
  await info.hover();
  await expect(page.getByRole('tooltip')).toContainText('根据年龄、计划、天数和费率');
  await info.click();
  const help = page.getByRole('dialog', { name: '函数说明', exact: true });
  await expect(help.getByText('计算单人保费', { exact: true })).toBeVisible();
  await expect(help.getByText('根据年龄、计划、天数和费率计算单人金额。')).toBeVisible();
  await expect(help.getByText(/单人试算金额，单位为整数分/)).toBeVisible();
  await help.getByText('查看函数详情与调用示例', { exact: true }).click();
  await expect(help.getByText('200', { exact: true })).toBeVisible();
  await help.getByText('查看函数详情与调用示例', { exact: true }).click();
  await help.getByRole('button', { name: '关闭', exact: true }).click();
  const planHelp = actionDialog.getByRole('button', { name: '投保方案说明', exact: true });
  await planHelp.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(planHelp).toBeFocused();
  await expect(
    page.getByRole('tooltip').filter({ hasText: /业务上期望计划字符串 basic 或 plus/ }),
  ).toBeVisible();
  await actionDialog
    .locator('details')
    .filter({ has: page.locator('[aria-label="ratePolicy 参数说明"]') })
    .locator('summary')
    .first()
    .click();
  const policy = actionDialog.locator('[aria-label="ratePolicy 参数说明"]');
  await policy.getByText('查看值结构与约束', { exact: true }).click();
  await expect(policy.getByText('允许汇总的最多被保险人数。')).toBeVisible();
  await policy.getByText('查看值结构与约束', { exact: true }).click();

  const argumentsByField = [
    alias + ' · /age',
    '表单根 · /plan',
    '表单根 · /days',
    '表单根 · /rates',
  ];
  for (const [index, parameter] of ['出行时年龄', '投保方案', '出行天数', '费率规则'].entries()) {
    await actionDialog.getByRole('combobox', { name: parameter + '取值来源', exact: true }).click();
    await page.getByRole('option', { name: '读取字段', exact: true }).click();
    const picker = page.getByRole('dialog', { name: parameter + '选择字段', exact: true });
    if (index === 0) await expect(picker.getByText(/业务上期望出行开始日的周岁年龄/)).toBeVisible();
    await picker.getByRole('radio', { name: argumentsByField[index], exact: true }).check();
    await picker.getByRole('button', { name: '应用选择', exact: true }).click();
  }
  await click(page, '应用动作');
  await expect(page.getByRole('dialog', { name: '添加动作', exact: true })).toBeHidden();
  await page.getByRole('button', { name: '动作下移', exact: true }).first().click();
  await click(page, '完成规则');
  const input = await schemaSource(page);
  const reordered = await input.inputValue();
  expect(JSON.parse(reordered).reactions).toEqual([
    opaque,
    { ...rule, then: [compute, recordAge] },
  ]);
  expect(reordered).toContain('"escaped":"\\u0061"');
  await click(page, '撤销');
  expect(JSON.parse(await input.inputValue()).reactions).toEqual([opaque]);
  await click(page, '重做');
  expect(await input.inputValue()).toEqual(reordered);
  const save = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/versions'),
  );
  await click(page, '保存配置');
  expect((await save).status()).toBe(201);
  await click(page, '返回版本列表');
  await page.reload();
  await chooseWorkingVersionAction(page, '编辑配置');
  expect(compactJson(await (await schemaSource(page)).inputValue())).toBe(compactJson(reordered));
  const { region, a, b } = await preview(page);
  const fee = (row: typeof a) => row.getByPlaceholder('成员保费');
  const age = (row: typeof a) => row.getByPlaceholder('成员年龄');
  await expect(fee(a)).toHaveValue('11');
  await expect(fee(b)).toHaveValue('22');
  await age(a).fill('16');
  await expect(fee(a)).toHaveValue('300');
  await expect(fee(b)).toHaveValue('22');
  await age(b).fill('25');
  await expect(fee(b)).toHaveValue('200');
  await region.getByPlaceholder('根天数').fill('3');
  await region.getByPlaceholder('根年龄', { exact: true }).fill('20');
  await expect(a.getByPlaceholder('执行时的根年龄')).toHaveValue('10');
  await expect(fee(a)).toHaveValue('300');
  await expect(fee(b)).toHaveValue('200');
  await b.getByRole('button', { name: '移到首位' }).click();
  await expect(
    region.getByRole('region', { name: '联动验收表单' }).getByRole('heading'),
  ).toHaveText(['联动验收表单', '乙', '甲']);
  await age(a).fill('24');
  await expect(a.getByPlaceholder('执行时的根年龄')).toHaveValue('20');
  await expect(fee(a)).toHaveValue('300');
  await expect(fee(b)).toHaveValue('200');
  await b.getByRole('button', { name: '移除' }).click();
  await expect(b).toHaveCount(0);
  await age(a).fill('13');
  await expect(fee(a)).toHaveValue('450');
  await click(page, '关闭预览');
  await click(page, '联动');
  await click(page, '编辑 ' + rule.id);
  await page.getByRole('button', { name: /lastRootAge/ }).click();
  await page.getByRole('button', { name: /加入观察.*表单根.*\/age/ }).click();
  const observeAction = page.getByRole('dialog', { name: '编辑动作', exact: true });
  if (await observeAction.isVisible())
    await observeAction.getByRole('button', { name: '取消', exact: true }).click();
  await click(page, '完成规则');
  const after = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(after.reactions[1].watch).toEqual([data('/age', alias), data('/age')]);
  const observed = await preview(page);
  await observed.region.getByPlaceholder('根年龄', { exact: true }).fill('21');
  await expect(fee(observed.a)).toHaveValue('200');
  await expect(fee(observed.b)).toHaveValue('300');
  await expect(observed.a.getByPlaceholder('执行时的根年龄')).toHaveValue('21');
  await expect(observed.b.getByPlaceholder('执行时的根年龄')).toHaveValue('21');
});

test('keeps validation projections separate, guards bound aliases, and edits a Host payload and boolean condition', async ({
  page,
}) => {
  await openSchemaDraft(page, JSON.stringify({ ...definition, reactions: [] }));
  await click(page, '联动');
  await click(page, '添加联动');
  await page.getByLabel('规则名称', { exact: true }).fill('check-member');
  await expect(page.getByLabel('首次激活时执行')).not.toBeChecked();
  await expect(page.getByText('整张表单', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: '配置执行范围' })).toBeHidden();
  await page.getByRole('button', { name: /更改范围/ }).click();
  await selectOption(page, '执行范围', '按数组逐项执行');
  await click(page, '选择来源数组');
  const scopePicker = page.getByRole('dialog', { name: '选择来源数组', exact: true });
  await expect(scopePicker.getByRole('complementary', { name: '已选字段' })).toHaveCount(0);
  await scopePicker.getByRole('searchbox').fill('/insureds');
  await scopePicker.getByRole('radio', { disabled: false }).check();
  await scopePicker.getByRole('button', { name: '应用选择', exact: true }).click();
  await page.getByLabel('成员名称', { exact: true }).fill(alias);
  await click(page, '应用范围');
  await expect(page.getByRole('dialog', { name: '配置执行范围' })).toBeHidden();
  await expect(page.getByText(/逐个成员/)).toBeVisible();
  await click(page, '添加观察');
  const picker = page.getByRole('dialog', { name: '添加观察', exact: true });
  await picker.getByLabel('搜索字段').fill('/age');
  const projections = ['status', 'issues', 'state'] as const;
  for (const projection of projections) {
    const labels = { status: '校验状态', issues: '校验问题列表', state: '完整校验结果' };
    await selectOption(page, '观察来源', labels[projection]);
    await picker
      .getByRole('checkbox', { name: alias + ' · /age · 校验 ' + projection, exact: true })
      .check();
  }
  const selected = picker.getByRole('complementary', { name: '已选字段' });
  await expect(selected.getByRole('heading', { name: '已选 3 项' })).toBeVisible();
  await selected.getByRole('button', { name: '移除 ' + alias + ' · /age · 完整校验结果' }).click();
  await expect(selected.getByRole('heading', { name: '已选 2 项' })).toBeVisible();
  await selectOption(page, '观察来源', '完整校验结果');
  await picker.getByRole('checkbox', { name: alias + ' · /age · 校验 state', exact: true }).check();
  await click(page, '应用选择');
  await page.getByRole('button', { name: /更改范围/ }).click();
  await selectOption(page, '执行范围', '整张表单');
  await expect(page.getByRole('button', { name: '应用范围' })).toBeDisabled();
  await expect(page.getByRole('dialog', { name: '配置执行范围' }).getByRole('alert')).toContainText(
    alias,
  );
  await page
    .getByRole('dialog', { name: '配置执行范围' })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await click(page, '添加条件');
  await expect(page.getByRole('button', { name: /添加「[且或]」条件/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: '条件取值来源', exact: true }).click();
  await page.getByRole('option', { name: '函数结果', exact: true }).click();
  await page.getByRole('combobox', { name: '条件纯函数', exact: true }).click();
  await page
    .getByRole('group', { name: '逻辑组合' })
    .getByRole('option', { name: '逻辑与', exact: true })
    .click();
  await page.getByRole('combobox', { name: '条件 2取值来源', exact: true }).click();
  await page.getByRole('option', { name: '具名表达式', exact: true }).click();
  await page.getByRole('combobox', { name: '条件 2具名表达式', exact: true }).click();
  await page.getByRole('option', { name: 'enabled', exact: true }).click();
  await click(page, '应用修改');
  await click(page, '添加动作');
  await selectOption(page, '动作类型', '通知宿主');
  await page.getByLabel('事件名').fill('travel.saveDraft');
  const payload = {
    root: { $expr: read('/age') },
    member: { $expr: read('/age', alias) },
    untouched: { $literal: { ref: data('/not-an-observation') } },
  };
  await page
    .getByRole('dialog', { name: /^(添加|编辑)动作$/ })
    .locator('.reaction-action-view-bar')
    .getByRole('button', { name: 'JSON 编辑' })
    .click();
  await page
    .getByRole('textbox', { name: '动作 JSON', exact: true })
    .fill(JSON.stringify({ type: 'host.emit', event: 'travel.saveDraft', payload }));
  await click(page, '应用动作');
  await page.getByRole('button', { name: /通知宿主/ }).click();
  await expect(
    page.getByRole('button', { name: '加入观察 表单根 · /age', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: '加入观察 ' + alias + ' · /age', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /加入观察.*not-an-observation/ })).toHaveCount(0);
  await page
    .getByRole('dialog', { name: '编辑动作', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  await click(page, '完成规则');
  const doc = JSON.parse(await (await schemaSource(page)).inputValue());
  const expected = projections.map((observe) => ({
    source: 'validation',
    field: data('/age', alias),
    observe,
  }));
  expect(doc.reactions).toEqual([
    {
      id: 'check-member',
      scope: { from: data('/insureds'), as: alias, mode: 'each' },
      watch: expected,
      when: { op: 'core.and', args: [false, { use: 'enabled' }] },
      then: [{ type: 'host.emit', event: 'travel.saveDraft', payload }],
    },
  ]);
});

test('keeps a compiler-rejected lexical reference out of a draft with a separate definition error', async ({
  page,
}) => {
  const raw = JSON.stringify({ ...definition, protocolVersion: undefined });
  await openSchemaDraft(page, raw);
  await click(page, '联动');
  await click(page, '编辑 handle-rule');
  const dialog = page.getByRole('dialog', { name: '编辑联动', exact: true });
  await dialog.getByRole('tab', { name: 'JSON 编辑' }).click();
  const editor = dialog.getByRole('textbox', { name: '规则 JSON' });
  await editor.fill(JSON.stringify({ ...opaque, when: read('/age', 'missingAlias') }));
  // Delay delivery of the real check response to exercise the modal's in-flight edit guard.
  let received!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    received = resolve;
  });
  const proceed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/check', async (route) => {
    const response = await route.fetch();
    received();
    await proceed;
    await route.fulfill({ response });
  });
  await dialog.getByRole('button', { name: '完成规则' }).click();
  await started;
  try {
    await expect(editor).toBeDisabled();
    await expect(dialog.getByRole('button', { name: '正在检查…' })).toBeDisabled();
  } finally {
    release();
  }
  await expect(dialog.getByRole('alert')).toContainText('/reactions/0');
  await click(page, '取消');
  expect(await (await schemaSource(page)).inputValue()).toBe(raw);
});

test('collapses execution scope after converting an existing travel rule to per-insured execution', async ({
  page,
}) => {
  const original = { ...travelDefinition, views: { desktop: travelDefinition.views.desktop } };
  await openSchemaDraft(page, JSON.stringify(original));
  await click(page, '联动');
  await click(page, '编辑 clear-city-on-country');
  const dialog = page.getByRole('dialog', { name: '配置执行范围' });
  const summary = page.locator('.reaction-scope-summary');
  await expect(summary).toContainText('整张表单');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: /更改范围/ }).click();
  await expect(dialog.getByRole('combobox', { name: '执行范围' })).toHaveText('整张表单');
  await expect(dialog.getByRole('button', { name: '选择来源数组' })).toBeHidden();
  await expect(dialog.getByLabel('成员名称')).toBeHidden();
  await selectOption(page, '执行范围', '按数组逐项执行');
  await expect(dialog.getByRole('button', { name: '应用范围' })).toBeDisabled();
  await click(page, '选择来源数组');
  const picker = page.getByRole('dialog', { name: '选择来源数组' });
  await picker.getByRole('searchbox').fill('/plan');
  await expect(picker.getByRole('radio', { disabled: false })).toHaveCount(0);
  await expect(picker.getByRole('button', { name: '应用选择' })).toBeDisabled();
  await picker.getByRole('searchbox').fill('/insureds');
  await picker.getByRole('radio', { disabled: false }).check();
  await picker.getByRole('button', { name: '应用选择' }).click();
  await expect(dialog.getByLabel('成员名称')).toHaveValue('insureds');
  await click(page, '应用范围');
  await expect(dialog).toBeHidden();
  await expect(summary).toContainText('被保险人列表 · 逐个成员');
  await click(page, '完成规则');
  const raw = await schemaSource(page);
  const saved = JSON.parse(await raw.inputValue());
  const originalRule = original.reactions![0];
  expect(saved.reactions[0]).toEqual({
    ...originalRule,
    scope: { from: data('/insureds'), as: 'insureds', mode: 'each' },
  });
  await click(page, '撤销');
  expect(JSON.parse(await raw.inputValue())).toEqual(original);
});

test('writes, moves, then notifies Host using the saved travel form actions', async ({ page }) => {
  const trip = {
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
    reactions: [
      {
        id: '旅险动作验收',
        scope: { from: data('/insureds'), as: 'insured', mode: 'each' },
        watch: [data('/age', 'insured')],
        then: [],
      },
    ],
  };
  await page.setViewportSize({ width: 1440, height: 1000 });
  await openSchemaDraft(page, JSON.stringify(trip));
  await click(page, '联动');
  await click(page, '编辑 旅险动作验收');
  async function add(name: string) {
    await click(page, '添加动作');
    await selectOption(page, '动作类型', name);
  }
  async function applyAction() {
    await click(page, '应用动作');
    await expect(page.getByRole('dialog', { name: /^(添加|编辑)动作$/ })).toBeHidden();
  }
  await add('设置字段');
  await selectTarget(page, '选择目标字段', '/estimatedTotalMinor');
  await page.setViewportSize({ width: 1180, height: 900 });
  const expression = page.getByRole('region', { name: '写入值', exact: true });
  await expression.getByRole('button', { name: 'JSON 编辑' }).click();
  await expression.getByRole('textbox', { name: '写入值 · 表达式 JSON' }).fill(
    JSON.stringify({
      op: 'travel.totalPremium',
      args: [read('/insureds'), read('/plan'), { use: 'tripDays' }, { literal: ratePolicy }],
    }),
  );
  await applyAction();

  await add('移动成员');
  await selectTarget(page, '选择目标数组', '/insureds');
  const inspector = page.getByRole('dialog', { name: /^(添加|编辑)动作$/ });
  await selectOption(page, '被移动的成员', 'insured');
  await selectOption(page, '目的位置', '指定下标');
  await expect(inspector.getByRole('spinbutton')).toHaveValue('0');
  await applyAction();

  await add('通知宿主');
  await page.getByLabel('事件名', { exact: false }).fill('travel.saveDraft');
  const hostAction = page.getByRole('dialog', { name: '添加动作', exact: true });
  await expect(hostAction).toBeVisible();
  await expect(
    page.locator('.reaction-drawer-buttons button').filter({ hasText: '完成规则' }),
  ).toBeDisabled();
  await expect(page.getByLabel('事件名', { exact: false })).toHaveValue('travel.saveDraft');
  await click(page, '添加消息内容');
  const message = page.getByRole('region', { name: '消息内容', exact: true });
  await message.getByRole('button', { name: 'JSON 编辑' }).click();
  await message
    .getByRole('textbox', { name: '消息内容 · 表达式 JSON' })
    .fill(JSON.stringify(read('/estimatedTotalMinor')));
  await applyAction();
  const tabs = page.getByRole('list', { name: '动作执行顺序' });
  await expect(tabs.locator('button[aria-haspopup=dialog]')).toHaveCount(3);
  const order = () => tabs.locator('button[aria-haspopup=dialog]').allTextContents();
  const before = await order();
  await tabs.getByRole('button', { name: '动作上移' }).last().click();
  await expect(tabs.locator('button[aria-haspopup=dialog]').nth(1)).toContainText('通知宿主');
  await tabs.getByRole('button', { name: '动作下移' }).nth(1).click();
  expect(await order()).toEqual(before);
  await click(page, '完成规则');
  const json = await schemaSource(page);
  const authored = compactJson(await json.inputValue());
  expect(JSON.parse(authored).reactions[0].then).toMatchObject([
    {
      op: 'set',
      target: data('/estimatedTotalMinor'),
      value: { $expr: { op: 'travel.totalPremium' } },
    },
    {
      op: 'array.move',
      target: data('/insureds'),
      item: { $scope: 'insured' },
      position: { kind: 'index', index: 0 },
    },
    {
      type: 'host.emit',
      event: 'travel.saveDraft',
      payload: { $expr: read('/estimatedTotalMinor') },
    },
  ]);
  const saved = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/versions'),
  );
  await click(page, '保存配置');
  const response = await saved;
  expect(response.status()).toBe(201);
  await click(page, '返回版本列表');
  await page.reload();
  await chooseWorkingVersionAction(page, '编辑配置');
  expect(compactJson(await (await schemaSource(page)).inputValue())).toBe(authored);
  await click(page, '联动');
  await click(page, '编辑 旅险动作验收');
  expect(await order()).toEqual(before);
  await click(page, '取消');

  const preview = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().endsWith('/preview'),
  );
  await click(page, '预览配置');
  const { success, prepared, diagnostics } = await (await preview).json();
  expect(success, JSON.stringify(diagnostics)).toBe(true);
  const { createRuntime } = await import('@form-engine/runtime');
  const {
    createCoreFunctions,
    createDateInclusiveDays,
    createTextIsNonBlank,
    createTravelIsEligibleAge,
    createTravelIsTripRangeAllowed,
    createTravelPersonPremium,
    createTravelRequiresGuardian,
    createTravelTotalPremium,
  } = await import('@form-engine/pure-functions');
  const artifact = {
    id: 'studio-web-preview',
    platform: 'web',
    digest: `sha256:${'5'.repeat(64)}` as const,
  };
  const functions = {
    ...createCoreFunctions(artifact),
    ...Object.fromEntries(
      [
        createDateInclusiveDays,
        createTextIsNonBlank,
        createTravelIsEligibleAge,
        createTravelIsTripRangeAllowed,
        createTravelPersonPremium,
        createTravelRequiresGuardian,
        createTravelTotalPremium,
      ].map((create) => {
        const binding = create(artifact);
        return [binding.manifest.id, binding];
      }),
    ),
  };
  const received: unknown[] = [];
  const sample = goldenData();
  const runtime = createRuntime({
    prepared,
    functions,
    data: sample,
    host: {
      validators: {
        'travel.checkEligibility': () => ({ result: Promise.resolve([]), cancel() {} }),
      },
      events: {
        'travel.saveDraft': ({ payload }) => {
          received.push(payload);
        },
        'travel.submit': () => {},
      },
    },
  });
  try {
    const change = runtime.dispatch({ op: 'set', target: data('/insureds/1/age'), value: 13 });
    expect(change.ok).toBe(true);
    expect((await runtime.flush()).status).toBe('settled');
    expect(runtime.snapshot()).toMatchObject({
      estimatedTotalMinor: 500,
      insureds: [
        { name: '儿童 B', age: 13 },
        { name: '成人 A', age: 30 },
      ],
    });
    expect(received).toEqual([500]);
  } finally {
    runtime.dispose();
  }
});

for (const width of [1440, 1180]) {
  test(`edits an insert action in the single-column editor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    const writeAge = set('/age', 10);
    const action = {
      op: 'array.insert',
      target: data('/insureds'),
      position: { kind: 'index', index: 0 },
      value: { $literal: members[0] },
    };
    await openSchemaDraft(
      page,
      JSON.stringify({
        ...definition,
        reactions: [{ id: '插入验收', watch: [data('/age')], then: [action, writeAge] }],
      }),
    );
    await click(page, '联动');
    await click(page, '编辑 插入验收');
    const firstAction = page.getByRole('button', { name: /插入成员/ }).first();
    await firstAction.click();
    const panel = page.getByRole('dialog', { name: /^(添加|编辑)动作$/ });
    const index = panel.getByRole('spinbutton', { name: '下标（从 0 开始）' });
    await expect(index).toHaveValue('0');
    await index.fill('3');
    await panel.getByRole('button', { name: '取消', exact: true }).click();
    await firstAction.click();
    await expect(index).toHaveValue('0');
    await index.fill('1');
    await panel.getByRole('button', { name: '应用动作' }).click();
    await expect(panel).toBeHidden();
    await click(page, '添加动作');
    await selectOption(page, '动作类型', '插入成员');
    await panel.getByRole('button', { name: '取消', exact: true }).click();
    await expect(
      page.getByRole('list', { name: '动作执行顺序' }).locator('button[aria-haspopup=dialog]'),
    ).toHaveCount(2);
    await click(page, '添加动作');
    await selectOption(page, '动作类型', '插入成员');
    await page
      .getByRole('dialog', { name: /^(添加|编辑)动作$/ })
      .locator('.reaction-action-view-bar')
      .getByRole('button', { name: 'JSON 编辑' })
      .click();
    await panel
      .getByRole('textbox', { name: '动作 JSON', exact: true })
      .fill(JSON.stringify(action));
    await panel.getByRole('button', { name: '应用动作' }).click();
    await expect(panel).toBeHidden();
    await click(page, '完成规则');
    const saved = JSON.parse(await (await schemaSource(page)).inputValue());
    expect(saved.reactions[0].then).toEqual([
      { ...action, position: { kind: 'index', index: 1 } },
      writeAge,
      action,
    ]);
  });
}

test('edits nested batch commands together and preserves untouched value wrappers', async ({
  page,
}) => {
  const batch = {
    op: 'batch',
    commands: [
      set('/age', 21),
      { op: 'patch', target: data(''), value: { age: 10, days: { $literal: 2 } } },
    ],
  };
  await openSchemaDraft(
    page,
    JSON.stringify({
      ...definition,
      reactions: [{ id: '批量动作', watch: [data('/plan')], then: [batch] }],
    }),
  );
  await click(page, '联动');
  await click(page, '编辑 批量动作');
  await page.getByRole('button', { name: /批量命令/ }).click();
  const panel = page.getByRole('dialog', { name: /^(添加|编辑)动作$/ });
  const patch = panel
    .locator('details')
    .filter({ has: page.locator('summary', { hasText: '2. 更新对象' }) });
  await patch.locator(':scope > summary').click();
  const editor = patch.getByRole('region', { name: 'age', exact: true });
  await editor.getByRole('button', { name: 'JSON 编辑' }).click();
  await editor.getByRole('textbox', { name: 'age · 表达式 JSON' }).fill('23');
  await patch.getByRole('button', { name: '上移' }).click();
  await click(page, '应用动作');
  await expect(panel).toBeHidden();
  await click(page, '完成规则');
  const written = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(written.reactions[0].then).toEqual([
    {
      op: 'batch',
      commands: [
        { op: 'patch', target: data(''), value: { age: { $expr: 23 }, days: { $literal: 2 } } },
        set('/age', 21),
      ],
    },
  ]);
});
