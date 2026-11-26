import { expect, test } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';
import { closeWorkbenchDrawer, openSchemaDraft, schemaSource } from './data-schema-fixture';
import { chooseWorkingVersionAction } from './working-version-menu';

test('逐层修改选项和事件命令，原文未编辑部分可逐字恢复', async ({ page }) => {
  const source = String.raw`{
    "protocolVersion":"1","id":"choice-layout","version":"draft",
    "metadata":{"rawNumber":1.00e+03},
    "data":{"schema":{"type":"object","properties":{"pick":{"type":"string"}}}},
    "views":{"web":{"material":"section","slots":{"default":[
      {"material":"select","bindings":{"value":{"source":"data","path":"/pick"}},
       "props":{"options":[{"id":"\u0041", "label":"Old label"}]}},
      {"material":"button","props":{"label":"设置选项"},"on":{"activate":{"type":"host.emit","event":"old"}}}
    ]}}}
  }`;
  await openSchemaDraft(page, source);
  await page.getByRole('button', { name: '布局', exact: true }).click();
  const outline = page.getByRole('navigation', { name: '视图大纲' });
  const settings = page.getByRole('region', { name: '控件配置' });
  await outline.getByRole('button', { name: /^select/ }).click();
  await settings.getByLabel('选项设置', { exact: true }).click();
  await settings.getByLabel('第 1 项显示名称', { exact: true }).fill('新标签');
  await settings.getByRole('button', { name: '＋ 添加选项' }).click();
  await settings.getByLabel('第 2 项写入值', { exact: true }).fill('B');
  await settings.getByLabel('第 2 项显示名称', { exact: true }).fill('第二项');
  await page.getByRole('button', { name: '应用属性', exact: true }).click();
  await expect(settings.getByLabel('第 1 项显示名称', { exact: true })).toBeHidden();

  await settings.getByLabel('选项设置', { exact: true }).click();
  await settings.getByRole('combobox', { name: '属性 options来源', exact: true }).click();
  await page.getByRole('option', { name: '表达式', exact: true }).click();
  await settings.getByLabel('属性 options协议 JSON', { exact: true }).fill('{"$expr":false}');
  await page.getByRole('button', { name: '应用属性', exact: true }).click();
  await expect(settings.getByRole('alert')).toBeVisible();

  await page
    .getByRole('dialog', { name: '固定选项' })
    .getByRole('button', { name: '关闭', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: '当前修改尚未应用' })
    .getByRole('button', { name: '放弃修改并继续' })
    .click();
  await outline.getByRole('button', { name: /^设置选项/ }).click();
  await settings.locator('summary').filter({ hasText: '事件 activate' }).click();
  await settings.getByLabel('Host 事件 activate').fill('尚未应用的事件');
  await expect(settings.getByLabel('显示名称', { exact: true })).toBeDisabled();
  const eventIntent = settings.getByRole('combobox', { name: '事件意图 activate' });
  await eventIntent.click();
  await page.getByRole('option', { name: '表单命令', exact: true }).click();
  await expect(eventIntent).toHaveText('表单命令');
  const command = { op: 'set', target: { source: 'data', path: '/pick' }, value: 'B' };
  await settings
    .getByRole('textbox', { name: '命令 activate', exact: true })
    .fill(JSON.stringify(command));
  await settings.getByRole('button', { name: '应用事件 activate' }).click();
  await expect(settings.getByRole('textbox', { name: '命令 activate', exact: true })).toBeHidden();

  const editor = await schemaSource(page);
  const result = await editor.inputValue();
  expect(result).toContain(String.raw`"id":"\u0041", "label":"新标签"`);
  expect(result).toContain('"rawNumber":1.00e+03');
  const [select, button] = JSON.parse(result).views.web.slots.default;
  expect(select.props.options).toEqual([
    { id: 'A', label: '新标签' },
    { id: 'B', label: '第二项' },
  ]);
  expect(button.on.activate).toEqual({ type: 'form.command', command });
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await expect(editor).toHaveValue(source);
});

test('edits the real travel template inline, previews pending values, then applies, undoes and reopens', async ({
  page,
}) => {
  const definition = { ...travelDefinition, views: { desktop: travelDefinition.views.desktop } };
  const source = JSON.stringify(definition);
  const click = (name: string) => page.getByRole('button', { name, exact: true }).click();
  await openSchemaDraft(page, source);
  await click('布局');
  const outline = page.getByRole('navigation', { name: '视图大纲' });
  const inspector = page.getByRole('region', { name: '控件配置' });
  const preview = page.locator('[aria-label="真实表单预览"]');
  const plan = preview
    .locator('select')
    .filter({ has: page.locator('option', { hasText: '升级方案' }) });
  const path = '/views/desktop/slots/default/1/slots/default/3/slots/default/0';
  await expect(plan.locator('option').nth(1)).toHaveText('基础方案');
  await plan.selectOption({ label: '升级方案' });
  await expect(plan.locator('option:checked')).toHaveText('升级方案');
  await outline.locator('[data-node-path="' + path + '"]').click();
  await inspector.getByLabel('提示文字', { exact: true }).fill('选择本次出行方案');
  await inspector.getByLabel('选项设置', { exact: true }).click();
  await inspector.getByLabel('第 1 项显示名称').fill('基础方案（试编）');
  await inspector.getByRole('button', { name: '下移第 1 项', exact: true }).click();
  await expect(page.locator('.workspace-save')).toBeDisabled();
  await expect(plan.locator('option').last()).toHaveText('基础方案（试编）');
  await expect(plan.locator('option').first()).toHaveText('选择本次出行方案');
  await expect(plan.locator('option:checked')).toHaveText('升级方案');
  await page.getByRole('button', { name: '应用属性', exact: true }).click();
  await expect(page.getByRole('button', { name: '应用属性', exact: true })).toBeHidden();

  const editor = await schemaSource(page);
  const edited = await editor.inputValue();
  const expected = JSON.parse(source);
  Object.assign(expected.views.desktop.slots.default[1].slots.default[3].slots.default[0].props, {
    placeholder: '选择本次出行方案',
    options: {
      $literal: [
        { id: 'plus', label: '升级方案' },
        { id: 'basic', label: '基础方案（试编）' },
      ],
    },
  });
  expect(JSON.parse(edited)).toEqual(expected);
  await click('撤销');
  await expect(editor).toHaveValue(source);
  await click('重做');
  await expect(editor).toHaveValue(edited);
  const saved = page.waitForResponse(
    (r) => r.url().endsWith('/versions') && r.request().method() === 'POST',
  );
  await click('保存配置');
  expect((await saved).status()).toBe(201);
  await click('返回版本列表');
  await page.reload();
  await chooseWorkingVersionAction(page, '编辑配置');
  await click('布局');
  await expect(plan.locator('option').last()).toHaveText('基础方案（试编）');
  expect(JSON.parse(await (await schemaSource(page)).inputValue())).toEqual(expected);
});

test('discard prevents an in-flight property check from committing into the draft', async ({
  page,
}) => {
  const source = JSON.stringify({
    protocolVersion: '1',
    id: 'layout-apply-race',
    version: 'draft',
    data: { schema: { type: 'object' } },
    views: { desktop: { material: 'section', props: { title: '原分区' } } },
  });
  await openSchemaDraft(page, source);
  await page.getByRole('button', { name: '布局', exact: true }).click();
  const inspector = page.getByRole('region', { name: '控件配置' });
  await page
    .getByRole('navigation', { name: '视图大纲' })
    .locator('[data-node-path="/views/desktop"]')
    .click();
  const { promise, resolve } = Promise.withResolvers<void>();
  await page.route('**/check', async (route) => {
    await promise;
    await route.continue();
  });
  try {
    await inspector.getByLabel('标题', { exact: true }).fill('不应保存的标题');
    const checking = page.waitForRequest('**/check');
    await page.getByRole('button', { name: '应用属性', exact: true }).click();
    await checking;
    const drawer = page.getByRole('dialog', { name: '原分区', exact: true });
    await drawer.getByRole('button', { name: '关闭', exact: true }).click();
    await page.getByRole('button', { name: '放弃修改并继续', exact: true }).click();
    await page.getByRole('button', { name: '复制布局', exact: true }).click();
    const copy = page.getByRole('dialog', { name: '复制布局', exact: true });
    await expect(copy).toBeVisible();
    const checked = page.waitForResponse('**/check');
    resolve();
    expect((await checked).ok()).toBeTruthy();
    await copy.getByRole('button', { name: '关闭', exact: true }).click();
    await page
      .getByRole('navigation', { name: '视图大纲' })
      .locator('[data-node-path="/views/desktop"]')
      .click();
    await expect(inspector.getByLabel('标题', { exact: true })).toHaveValue('原分区');
    await expect(await schemaSource(page)).toHaveValue(source);
  } finally {
    resolve();
  }
});

test('repairing an incomplete number to its original value clears pending navigation', async ({
  page,
}) => {
  const source = JSON.stringify({
    protocolVersion: '1',
    id: 'layout-number-repair',
    version: 'draft',
    data: { schema: { type: 'object', properties: { name: { type: 'string' } } } },
    views: {
      desktop: {
        material: 'text-input',
        bindings: { value: { source: 'data', path: '/name' } },
        props: { maxLength: 12 },
      },
    },
  });
  await openSchemaDraft(page, source);
  await page.getByRole('button', { name: '布局', exact: true }).click();
  await page
    .getByRole('navigation', { name: '视图大纲' })
    .locator('[data-node-path="/views/desktop"]')
    .click();
  const input = page.getByLabel('最长字符数', { exact: true });
  await input.fill('');
  await expect(page.locator('.workspace-save')).toBeDisabled();
  await input.fill('12');
  await expect(page.getByRole('button', { name: '应用属性', exact: true })).toBeHidden();
  await expect(await schemaSource(page)).toHaveValue(source);
});

test('an unavailable preview Host does not retain the old runtime controls', async ({ page }) => {
  const source = JSON.stringify({
    protocolVersion: '1',
    id: 'layout-preview-host',
    version: 'draft',
    data: { schema: { type: 'object' } },
    views: {
      desktop: {
        material: 'button',
        props: { label: '旧预览按钮' },
        on: { activate: { type: 'host.emit', event: 'travel.saveDraft' } },
      },
    },
  });
  await openSchemaDraft(page, source);
  await page.getByRole('button', { name: '布局', exact: true }).click();
  const preview = page.getByRole('region', { name: '真实表单预览' });
  await expect(preview.getByRole('button', { name: '旧预览按钮' })).toBeVisible();
  await page
    .getByRole('navigation', { name: '视图大纲' })
    .locator('[data-node-path="/views/desktop"]')
    .click();
  const inspector = page.getByRole('region', { name: '控件配置' });
  await inspector.locator('summary').filter({ hasText: '事件 activate' }).click();
  await inspector.getByLabel('Host 事件 activate').fill('unavailable.sampleHost');
  await inspector.getByRole('button', { name: '应用事件 activate' }).click();
  await closeWorkbenchDrawer(page);
  await expect(preview.getByText(/未配置这些模拟能力.*unavailable.sampleHost/)).toBeVisible();
  await expect(preview.getByRole('button', { name: '旧预览按钮' })).toHaveCount(0);
});

test('configures text input values without applying the property until confirmed', async ({
  page,
}) => {
  const source = JSON.stringify({
    protocolVersion: '1',
    id: 'layout-source-modes',
    version: 'draft',
    data: { schema: { type: 'object', properties: { name: { type: 'string' } } } },
    views: {
      desktop: {
        material: 'text-input',
        bindings: { value: { source: 'data', path: '/name' } },
        props: { placeholder: '原提示文字' },
      },
    },
  });
  await openSchemaDraft(page, source);
  await page.getByRole('button', { name: '布局', exact: true }).click();
  await page
    .getByRole('navigation', { name: '视图大纲' })
    .locator('[data-node-path="/views/desktop"]')
    .click();
  const drawer = page.getByRole('dialog', { name: '文本输入', exact: true });
  const configure = drawer.getByRole('button', { name: '配置提示文字的取值', exact: true });
  const input = drawer.getByRole('textbox', { name: '提示文字', exact: true });
  await expect(input).toHaveValue('原提示文字');
  await configure.click();
  const takeValue = page.getByRole('dialog', { name: '提示文字的取值', exact: true });
  await takeValue.getByRole('combobox', { name: '提示文字的取值取值来源' }).click();
  await page.getByRole('option', { name: '读取字段', exact: true }).click();
  await expect(takeValue.getByRole('button', { name: '选择字段', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(takeValue).toBeHidden();
  await expect(configure).toBeFocused();
  await expect(input).toHaveValue('原提示文字');
  await expect(drawer.getByRole('button', { name: '应用属性', exact: true })).toBeHidden();
});
