import { chooseWorkingVersionAction } from './working-version-menu';
import { expect, test } from '@playwright/test';
import { openSchemaDraft, schemaSource } from './data-schema-fixture';

test('校验编辑器写入共享草稿并通过 Compiler 筛选同步规则前置', async ({ page }) => {
  const ref = { source: 'data', path: '/age' };
  const gate = { id: 'gate', kind: 'internal', assert: true, issue: { target: ref, code: 'GATE' } };
  await openSchemaDraft(
    page,
    JSON.stringify({
      id: 'constraints',
      version: 'draft',
      protocolVersion: '1',
      data: {
        schema: {
          type: 'object',
          properties: {
            age: { type: 'integer' },
            people: { type: 'array', items: { type: 'object' } },
          },
        },
      },
      views: { entry: { material: 'section' } },
      constraints: [gate, { ...gate, id: 'second', issue: { ...gate.issue, code: 'SECOND' } }],
    }),
  );
  await page.getByRole('button', { name: '校验', exact: true }).click();
  await page.getByRole('button', { name: '编辑 second', exact: true }).click();
  await page.getByRole('button', { name: '选择内部规则前置' }).click();
  await page.getByRole('button', { name: '使用 gate', exact: true }).click();
  await expect(page.getByText(/规则 · gate/)).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('button', { name: '编辑 gate', exact: true }).click();
  await page.getByRole('button', { name: '删除校验', exact: true }).click();
  let impact = page.getByRole('dialog', { name: '删除校验规则', exact: true });
  await expect(impact.getByText(/PREREQUISITE_NOT_FOUND/)).toBeVisible();
  await expect(impact.getByRole('button', { name: '确认删除校验规则' })).toBeDisabled();
  await impact.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '切换校验方式' }).click();
  impact = page.getByRole('dialog', { name: '切换校验方式', exact: true });
  await expect(impact.getByText(/PREREQUISITE_EXTERNAL/)).toBeVisible();
  await impact.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '配置作用域', exact: true }).click();
  const scope = page.getByRole('dialog', { name: '配置执行范围', exact: true });
  await scope.getByRole('radio', { name: '按数组逐项执行', exact: true }).check();
  await scope.getByRole('button', { name: '应用范围', exact: true }).click();
  impact = page.getByRole('dialog', { name: '变更执行范围', exact: true });
  await expect(impact.getByText(/PREREQUISITE_SCOPE_AMBIGUOUS/)).toBeVisible();
  await impact.getByRole('button', { name: '关闭', exact: true }).click();
  await page
    .getByRole('dialog', { name: '编辑校验', exact: true })
    .getByRole('button', { name: '取消', exact: true })
    .click();
  const text = await schemaSource(page);
  expect(JSON.parse(await text.inputValue()).constraints[1].requires).toEqual([
    { kind: 'constraint', constraintId: 'gate' },
  ]);
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  expect(JSON.parse(await text.inputValue()).constraints[1].requires).toBeUndefined();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/versions'),
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  expect((await saved).status()).toBe(201);
  await page.getByRole('button', { name: '返回版本列表', exact: true }).click();
  await page.reload();
  await chooseWorkingVersionAction(page, '编辑配置');
  expect(JSON.parse(await (await schemaSource(page)).inputValue()).constraints[1].requires).toEqual(
    [{ kind: 'constraint', constraintId: 'gate' }],
  );
});

test('字段前置通过实际 Compiler 拒绝间接环并区分根与成员同名路径', async ({ page }) => {
  const ref = (path: string, scope?: string) => ({ source: 'data', path, ...(scope && { scope }) });
  const memberScope = { as: 'person', from: ref('/people'), mode: 'each' };
  const age = { type: 'integer' };
  await openSchemaDraft(
    page,
    JSON.stringify({
      id: 'constraint-fields',
      version: 'draft',
      protocolVersion: '1',
      data: {
        schema: {
          type: 'object',
          properties: {
            age,
            people: { type: 'array', items: { type: 'object', properties: { age, score: age } } },
          },
        },
      },
      views: { entry: { material: 'section' } },
      constraints: [
        {
          id: 'gate',
          kind: 'internal',
          scope: memberScope,
          assert: true,
          issue: { target: ref('/age', 'person'), code: 'GATE' },
        },
        {
          id: 'child',
          kind: 'internal',
          scope: memberScope,
          assert: true,
          issue: { target: ref('/score', 'person'), code: 'CHILD' },
          requires: [{ kind: 'constraint', constraintId: 'gate' }],
        },
      ],
    }),
  );
  await page.getByRole('button', { name: '校验', exact: true }).click();
  await page.getByRole('button', { name: '编辑 gate', exact: true }).click();
  await page.getByRole('button', { name: '选择字段前置', exact: true }).click();
  const picker = page.getByRole('dialog', { name: '选择字段前置', exact: true });
  const select = async (name: string) => {
    await picker.getByRole('radio', { name, exact: true }).check();
    await picker.getByRole('button', { name: '应用选择', exact: true }).click();
  };
  await select('person · /score');
  await expect(picker.getByRole('alert')).toContainText('PREREQUISITE_CYCLE');
  await select('表单根 · /age');
  await expect(picker).toBeHidden();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const source = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(source.constraints[0].requires).toEqual([
    { kind: 'field', phase: 'sync', target: ref('/age') },
  ]);
});

test('创建逐成员 Host 校验并配置观察、结果归属和可视组合条件', async ({ page }) => {
  await openSchemaDraft(
    page,
    JSON.stringify({
      protocolVersion: '1',
      id: 'host-constraint',
      version: 'draft',
      data: {
        schema: {
          type: 'object',
          properties: {
            age: { type: 'integer' },
            people: {
              type: 'array',
              items: { type: 'object', properties: { age: { type: 'integer' } } },
            },
          },
        },
      },
      views: { entry: { material: 'section' } },
    }),
  );
  const click = (name: string) => page.getByRole('button', { name, exact: true }).click();
  await click('校验');
  await click('添加校验');
  await page.getByLabel('规则名称', { exact: true }).fill('check-age');
  await click('切换校验方式');
  await click('确认切换校验方式');
  await click('配置作用域');
  await page.getByRole('radio', { name: '按数组逐项执行', exact: true }).check();
  await page.getByText('高级设置', { exact: true }).click();
  await page.getByLabel('成员别名', { exact: true }).fill('person');
  await click('应用范围');
  await click('确认变更执行范围');
  await click('添加 Host 读取');
  const watch = page.getByRole('dialog', { name: '添加 Host 读取', exact: true });
  await watch.getByRole('checkbox', { name: '表单根 · /age', exact: true }).check();
  await watch.getByRole('checkbox', { name: 'person · /age', exact: true }).check();
  await click('应用选择');
  await click('选择结果归属');
  const target = page.getByRole('dialog', { name: '选择结果归属', exact: true });
  await target.getByRole('radio', { name: 'person · /age', exact: true }).check();
  await click('应用选择');
  await click('编辑适用条件');
  await expect(page.getByRole('button', { name: /添加「[且或]」条件/ })).toHaveCount(0);
  await page.getByRole('combobox', { name: '适用条件取值来源', exact: true }).click();
  await page.getByRole('option', { name: '函数结果', exact: true }).click();
  await page.getByRole('combobox', { name: '适用条件纯函数', exact: true }).click();
  await page
    .getByRole('group', { name: '逻辑组合' })
    .getByRole('option', { name: '逻辑或', exact: true })
    .click();
  await click('应用表达式');
  await expect(page.getByRole('dialog', { name: '编辑适用条件', exact: true })).toBeHidden();
  await click('编辑适用条件');
  await click('适用条件编辑表达式 JSON');
  const expression = page.getByRole('dialog', { name: '适用条件 · 表达式 JSON' });
  await expression.getByRole('textbox').fill(
    JSON.stringify({
      op: 'core.eq',
      args: [
        {
          ref: { source: 'validation', field: { source: 'data', path: '/age' }, observe: 'status' },
        },
        'valid',
      ],
    }),
  );
  await expression.getByRole('button', { name: '应用表达式', exact: true }).click();
  await click('应用表达式');
  const condition = page.getByRole('dialog', { name: '编辑适用条件', exact: true });
  await expect(condition.getByRole('alert')).toContainText('VALIDATION_NOT_AVAILABLE');
  await condition.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  const source = JSON.parse(await (await schemaSource(page)).inputValue());
  expect(source.constraints).toEqual([
    {
      id: 'check-age',
      kind: 'external',
      validator: 'travel.checkEligibility',
      scope: { as: 'person', from: { source: 'data', path: '/people' }, mode: 'each' },
      watch: [
        { source: 'data', path: '/age' },
        { source: 'data', scope: 'person', path: '/age' },
      ],
      target: { source: 'data', scope: 'person', path: '/age' },
      when: { op: 'core.or', args: [false, false] },
    },
  ]);
});

test('新增与编辑共用大抽屉，完成和取消分别提交与丢弃整条规则', async ({ page }) => {
  await openSchemaDraft(
    page,
    JSON.stringify({
      protocolVersion: '1',
      id: 'travel-dates',
      version: 'draft',
      data: {
        schema: {
          type: 'object',
          properties: {
            start: { type: 'string', format: 'date', title: '出发日期' },
            end: { type: 'string', format: 'date', title: '返程日期' },
          },
        },
      },
      views: { main: { material: 'section' } },
    }),
  );
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('校验').click();
  const add = button('添加校验');
  await add.focus();
  await page.keyboard.press('Enter');
  const drawer = page.getByRole('dialog', { name: '新增校验', exact: true });
  const rect = await drawer.boundingBox();
  expect(rect?.width).toBe(740);
  expect(rect!.x + rect!.width).toBeCloseTo(page.viewportSize()!.width, 0);
  await drawer.getByRole('combobox', { name: '校验要求' }).click();
  await page.getByRole('option', { name: '日期不早于另一字段' }).click();
  await drawer.getByLabel('提示文案', { exact: true }).fill('请检查返程日期');
  await expect(drawer.locator('.constraint-preview')).toContainText('返程日期 不早于 出发日期');
  await drawer.getByRole('button', { name: '完成', exact: true }).click();
  const edit = button('编辑 rule-1');
  await expect(edit).toBeFocused();
  const card = page.locator('.constraint-list article').first();
  await expect(card).toContainText('请检查返程日期');
  await edit.click();
  await page.getByLabel('提示文案', { exact: true }).fill('暂存的文案');
  await page.keyboard.press('Escape');
  await button('继续编辑').click();
  await expect(page.getByLabel('提示文案', { exact: true })).toHaveValue('暂存的文案');
  await button('取消').click();
  await button('放弃修改').click();
  await expect(edit).toBeFocused();
  await expect(card).not.toContainText('暂存的文案');
  await add.click();
  await page.getByLabel('规则名称', { exact: true }).fill('another-rule');
  await button('取消').click();
  await button('放弃修改').click();
  await expect(add).toBeFocused();
  await expect(page.locator('.constraint-list article')).toHaveCount(1);
  await edit.click();
  await page.getByLabel('提示文案', { exact: true }).fill('返程不能早于出发');
  await button('完成').click();
  await expect(card).toContainText('返程不能早于出发');
  await button('保存配置').click();
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible();
  await button('返回版本列表').click();
  await chooseWorkingVersionAction(page, '保存历史');
  await page
    .getByRole('dialog', { name: '保存历史' })
    .getByRole('button', { name: '查看快照' })
    .first()
    .click();
  await button('校验').click();
  await expect(card).toContainText('返程不能早于出发');
  await expect(edit).toHaveCount(0);
  await expect(add).toHaveCount(0);
});
