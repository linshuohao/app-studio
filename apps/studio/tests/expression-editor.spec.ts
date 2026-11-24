import { chooseWorkingVersionAction } from './working-version-menu';
import { expect, test, type Locator } from '@playwright/test';
import type { Expression } from '@form-engine/protocol/definition';
import { goldenData } from '../../playground/src/demos/travel/policy';
import { travelDefinition, ref } from '../../playground/src/demos/travel/definition';
import { openSchemaDraft, schemaSource } from './data-schema-fixture';

const compare = (op: string, ...args: Expression[]): Expression => ({ op, args });

async function setExpression(dialog: Locator, label: string, raw: string) {
  await dialog.getByRole('button', { name: label + '编辑表达式 JSON', exact: true }).click();
  const source = dialog.page().getByRole('dialog', { name: label + ' · 表达式 JSON', exact: true });
  await source.getByRole('textbox').fill(raw);
  await source.getByRole('button', { name: '应用表达式', exact: true }).click();
  await expect(source).toBeHidden();
}

test('the shared editor verifies, applies, undoes and reopens expressions from the real travel definition', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const source = JSON.stringify({
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
  });
  const layoutCondition = compare(
    'core.and',
    compare('core.eq', { ref: ref('/plan') }, 'basic'),
    compare(
      'core.or',
      compare('core.eq', { use: 'tripDays' }, 2),
      compare('core.and', true, false),
    ),
  );
  const reactionCondition = compare('core.and', compare('core.eq', { use: 'tripDays' }, 2), true);
  const constraintExpression = compare('core.eq', { ref: ref('/age', 'person') }, 12);
  const click = (name: string) => page.getByRole('button', { name, exact: true }).click();
  async function enterFormData(dialog: Locator) {
    const editor = dialog.getByRole('textbox', { name: '表单数据 JSON', exact: true });
    if (!(await editor.isVisible()))
      await dialog.locator('summary').filter({ hasText: '表单数据 JSON' }).click();
    await editor.fill(JSON.stringify(goldenData()));
  }
  const run = (dialog: Locator) => dialog.getByRole('button', { name: '运行验证' }).click();
  const result = (dialog: Locator) =>
    dialog.getByRole('region', { name: '给定值验证' }).getByRole('status');

  await openSchemaDraft(page, source);
  await click('布局');
  const outline = page.getByRole('navigation', { name: '视图大纲' });
  const planPath = '/views/desktop/slots/default/1/slots/default/3/slots/default/0';
  await outline.locator('[data-node-path="' + planPath + '"]').click();
  await click('编辑显示条件');
  const layout = page.getByRole('dialog', { name: '显示条件', exact: true });
  await setExpression(layout, '显示条件', JSON.stringify(layoutCondition));
  const rootToggle = layout.getByRole('button', { name: '收起显示条件', exact: true });
  await rootToggle.press('Space');
  await expect(layout.locator('.expression-fold-summary')).toContainText('全部满足');
  await expect(layout.locator('.expression-fold-summary')).toHaveCSS('white-space', 'nowrap');
  const detailsTrigger = layout.getByRole('button', { name: '显示条件表达式详情', exact: true });
  await detailsTrigger.press('Enter');
  const details = page.getByRole('dialog', { name: '显示条件 · 表达式详情', exact: true });
  const parameters = details.locator('dl').first().locator(':scope > div');
  await expect(parameters).toHaveCount(2);
  const branch = parameters.first().locator('dd > details').first();
  await branch.locator('summary').first().press('Enter');
  await expect(branch.locator('dl').first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(details).toBeHidden();
  await expect(detailsTrigger).toBeFocused();
  await layout.getByRole('button', { name: '展开显示条件', exact: true }).press('Enter');
  const firstComparison = layout.getByRole('button', { name: '展开条件 1', exact: true }).first();
  await firstComparison.press('Enter');
  const leftSource = layout.getByRole('combobox', { name: '左侧值取值来源', exact: true });
  await leftSource.click();
  await page.getByRole('option', { name: '函数结果', exact: true }).click();
  await layout.getByRole('combobox', { name: '左侧值纯函数', exact: true }).click();
  await expect(page.getByRole('group', { name: '比较与判断' })).toBeVisible();
  await page.getByRole('option', { name: '大于', exact: true }).click();
  const collapse = layout.getByRole('button', { name: '收起左侧值', exact: true });
  await expect(collapse).toBeVisible();
  await collapse.press('Space');
  await expect(
    layout.locator('.expression-fold-summary').filter({ hasText: '0 大于 0' }),
  ).toBeVisible();
  await setExpression(layout, '显示条件', JSON.stringify(layoutCondition));
  const tree = layout.getByRole('region', { name: '条件树' });
  await expect(tree.getByText('全部满足', { exact: true }).first()).toBeVisible();
  await expect(tree.getByText('任一满足', { exact: true })).toBeVisible();
  await expect(tree.getByText('2 项 · 在编辑区展开')).toBeVisible();

  await enterFormData(layout);
  await run(layout);
  await expect(result(layout)).toHaveText('条件成立 · 显示');
  await expect(tree.getByText('短路跳过', { exact: true })).toHaveCount(1);
  await layout.getByLabel('样例 · /plan', { exact: true }).fill('plus');
  await run(layout);
  await expect(result(layout)).toHaveText('条件不成立 · 隐藏');
  await expect(tree.getByText('短路跳过', { exact: true })).toHaveCount(3);
  await layout.getByRole('button', { name: '应用显示条件', exact: true }).click();
  await expect(layout).toBeHidden();
  const editor = await schemaSource(page);
  const laidOut = await editor.inputValue();
  const node = JSON.parse(laidOut).views.desktop.slots.default[1].slots.default[3].slots.default[0];
  expect(node.props.visible).toEqual({ $expr: layoutCondition });
  expect(node.slots.default[0]).toEqual(
    JSON.parse(source).views.desktop.slots.default[1].slots.default[3].slots.default[0],
  );
  await click('撤销');
  await expect(editor).toHaveValue(source);
  await click('重做');
  await expect(editor).toHaveValue(laidOut);

  await click('联动');
  await click('estimate-total');
  await click('添加条件');
  const reaction = page.getByRole('dialog', { name: '成立条件', exact: true });
  await setExpression(reaction, '条件', JSON.stringify(reactionCondition));
  await reaction.getByRole('button', { name: '条件：验证表达式' }).click();
  const trial = page.getByRole('dialog', { name: '验证表达式 · 条件' });
  await enterFormData(trial);
  await run(trial);
  await expect(result(trial)).toHaveText('结果 · true');
  await trial.getByRole('button', { name: '关闭' }).click();
  await reaction.getByRole('button', { name: '应用修改', exact: true }).click();
  await expect(reaction).toBeHidden();
  const conditionSummary = page
    .locator('section')
    .filter({
      has: page.getByRole('heading', { name: '成立条件', exact: true }),
    })
    .last();
  await expect(conditionSummary.getByRole('list').first()).toBeVisible();
  await expect(
    conditionSummary.getByText(
      '出发日期（缺失时取空值）到返程日期（缺失时取空值）的天数（含首尾） 等于 2',
      { exact: true },
    ),
  ).toBeVisible();
  const disclosure = conditionSummary.locator('summary').filter({ hasText: '查看定义' });
  await expect(conditionSummary.getByText('日期天数', { exact: true })).toBeHidden();
  await disclosure.click();
  await expect(conditionSummary.getByText('日期天数', { exact: true })).toBeVisible();
  const start = conditionSummary.locator('dt').filter({ hasText: '业务上期望 开始日期字符串' });
  await expect(start).toContainText('start');
  await expect(start.locator('+ dd')).toContainText('/travel/startDate');
  await expect(conditionSummary.getByText('左侧待比较的值。', { exact: true })).toBeVisible();
  await disclosure.click();
  await expect(start).toBeHidden();
  const reacted = await (await schemaSource(page)).inputValue();
  expect(JSON.parse(reacted).reactions[1].when).toEqual(reactionCondition);
  await click('撤销');
  await expect(editor).toHaveValue(laidOut);
  await click('重做');
  await expect(editor).toHaveValue(reacted);

  await click('校验');
  await click('guardian-required');
  await click('编辑判断表达式');
  const assertion = page.getByRole('dialog', { name: '编辑判断表达式', exact: true });
  await setExpression(assertion, '判断表达式', JSON.stringify(constraintExpression));
  await enterFormData(assertion);
  await run(assertion);
  await expect(result(assertion)).toHaveText('断言失败');
  await assertion.getByLabel('person样例成员').fill('2');
  await run(assertion);
  await expect(result(assertion)).toHaveText('断言通过');
  await assertion.getByRole('button', { name: '应用表达式', exact: true }).click();
  await expect(assertion).toBeHidden();
  await expect(page.getByText(/person · \/age.*等于 12/).first()).toBeVisible();
  const final = await (await schemaSource(page)).inputValue();
  expect(
    JSON.parse(final).constraints.find((item: { id: string }) => item.id === 'guardian-required')
      .assert,
  ).toEqual(constraintExpression);
  await click('撤销');
  await expect(editor).toHaveValue(reacted);
  await click('重做');
  await expect(editor).toHaveValue(final);
  await click('检查配置');
  await expect(page.getByText('配置检查通过 · web / desktop', { exact: true })).toBeVisible();
  await click('关闭检查');
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/versions'),
  );
  await click('保存配置');
  expect((await saved).status()).toBe(201);
  await click('返回版本列表');
  await page.reload();
  await chooseWorkingVersionAction(page, '编辑配置');
  expect(JSON.parse(await (await schemaSource(page)).inputValue())).toEqual(JSON.parse(final));
});

test('layout expression verification ignores a canceled response and rejects the wrong property type', async ({
  page,
}) => {
  const source = JSON.stringify({
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
  });
  await openSchemaDraft(page, source);
  await page.getByRole('button', { name: '布局', exact: true }).click();
  const outline = page.getByRole('navigation', { name: '视图大纲' });
  await outline
    .locator('[data-node-path="/views/desktop/slots/default/1/slots/default/3/slots/default/0"]')
    .click();
  const inspector = page.getByRole('region', { name: '控件配置' });
  const value = inspector.getByLabel('属性 disabled来源', { exact: true });
  const property = value.locator(
    'xpath=ancestor::div[contains(@class, "layout-value") and not(contains(@class, "layout-value-heading"))][1]',
  );
  await value.selectOption('expression');
  await property.getByRole('button', { name: '编辑表达式', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '禁用 · 表达式', exact: true });
  const run = dialog.getByRole('button', { name: '运行验证', exact: true });
  await setExpression(dialog, '禁用 · 表达式', '"错类型"');
  await run.click();
  await expect(
    dialog.getByRole('status').filter({ hasText: '结果与当前位置的类型不匹配' }),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '应用表达式', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('常量不符合参数或结果要求');

  await setExpression(
    dialog,
    '禁用 · 表达式',
    JSON.stringify(compare('core.eq', { ref: ref('/plan') }, 'basic')),
  );
  const sample = dialog.getByLabel('样例 · /plan', { exact: true });
  await sample.fill('basic');
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const intercepted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const routePattern = '**/api/platform/forms/*/preview';
  await page.route(
    routePattern,
    async (route) => {
      const body = route.request().postDataJSON();
      if (!body.text?.includes('"studio-expression-verification"')) return route.continue();
      started();
      await hold;
      await route.abort().catch(() => {});
    },
    { times: 1 },
  );
  await run.click();
  await intercepted;
  try {
    await sample.fill('plus');
    await sample.fill('basic');
    await expect(run).toBeEnabled();
  } finally {
    release();
  }
  await run.click();
  await expect(dialog.getByRole('status').filter({ hasText: '结果 · true' })).toBeVisible();
  await dialog.getByRole('button', { name: '应用表达式', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page
      .getByRole('region', { name: '真实表单预览' })
      .getByRole('combobox', { name: '出行方案', exact: true }),
  ).toBeDisabled();
  await inspector.getByRole('button', { name: '应用属性', exact: true }).click();
  await expect(inspector.getByRole('button', { name: '应用属性', exact: true })).toBeHidden();
  const edited = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(
    edited.views.desktop.slots.default[1].slots.default[3].slots.default[0].props.disabled,
  ).toEqual({ $expr: compare('core.eq', { ref: ref('/plan') }, 'basic') });
});
