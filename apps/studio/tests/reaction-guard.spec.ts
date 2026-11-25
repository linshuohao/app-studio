import { expect, test } from '@playwright/test';
import { compactJson } from '../src/app/format-json';
import { openSchemaDraft, schemaSource } from './data-schema-fixture';

test('isolates Compiler diagnostics, preserves adjacent tokens and routes ambiguous rules to raw repair', async ({
  page,
}) => {
  const from = String.raw`{"path":"/pe\u006fple","source":"data"}`;
  const rule = `{"id":"editable","scope":{"from":${from},"as":"current","mode":"each"},"watch":[],"then":[]}`;
  const input = String.raw`{
    "id":"reaction-guards","protocolVersion":"1","version":"draft",
    "data":{"schema":{"type":"object","properties":{"people":{"type":"array","items":{"type":"object","properties":{"age":{"type":"integer"}}}},"labels":{"type":"array","items":{"type":"string"}}}}},
    "views":{"desktop":{"material":"section"}},
    "expressions":{"neverUsed":{"use":"missingElsewhere"}},
    "metadata":{"unchanged":9.007199254740993e15,"raw":"\u0041"},
    "reactions":[{"id":"unfinished","watch":[],"then":null},${rule}]
  }`;
  await openSchemaDraft(page, input);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('联动').click();
  await button('编辑 editable').click();
  await page.getByRole('button', { name: /更改范围/ }).click();
  await page.getByLabel('成员名称', { exact: true }).fill('covered');
  await button('应用范围').click();

  const renamed = rule.replace('"current"', '"covered"');
  const expected = input.replace(rule, renamed);
  await button('完成规则').click();
  const raw = await schemaSource(page);
  expect(compactJson(await raw.inputValue())).toBe(compactJson(expected));

  await button('联动').click();
  await button('编辑 editable').click();
  const dialog = page.getByRole('dialog', { name: '编辑联动', exact: true });
  await dialog.getByRole('tab', { name: 'JSON 编辑' }).click();
  const editor = dialog.getByRole('textbox', { name: '规则 JSON' });
  const invalidWatch = '"watch":[{"source":"data","scope":"notBound","path":""}]';
  await editor.fill(renamed.replace('"watch":[]', invalidWatch));
  const checked = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/check'),
  );
  await button('完成规则').click();
  expect((await checked).ok()).toBeTruthy();
  await expect(dialog.getByRole('alert')).toContainText('/reactions/1/watch/0');
  await expect(dialog.getByRole('alert')).toContainText('notBound');
  await button('取消').click();
  expect(compactJson(await (await schemaSource(page)).inputValue())).toBe(compactJson(expected));

  await button('联动').click();
  await button('编辑 editable').click();
  await dialog.getByRole('tab', { name: 'JSON 编辑' }).click();
  const valid = renamed.replace(
    '"watch":[]',
    '"watch":[{"source":"data","scope":"covered","path":"/age"}]',
  );
  await editor.fill(valid);
  await button('完成规则').click();
  await expect(dialog).toBeHidden();
  const accepted = await schemaSource(page);
  expect(compactJson(await accepted.inputValue())).toBe(compactJson(input.replace(rule, valid)));

  await button('联动').click();
  await button('编辑 editable').click();
  await page.getByRole('button', { name: /更改范围/ }).click();
  const scopeEditor = page.getByRole('dialog', { name: '配置执行范围', exact: true });
  await expect(scopeEditor.getByLabel('成员名称')).toHaveValue('covered');
  await scopeEditor.getByRole('button', { name: '/people', exact: true }).click();
  const arrayPicker = page.getByRole('dialog', { name: '/people', exact: true });
  await arrayPicker.getByRole('searchbox').fill('/labels');
  await arrayPicker.getByRole('radio', { disabled: false }).check();
  await arrayPicker.getByRole('button', { name: '应用选择', exact: true }).click();
  await expect(scopeEditor.getByLabel('成员名称')).toHaveValue('covered');
  await expect(scopeEditor.getByRole('button', { name: '应用范围', exact: true })).toBeDisabled();
  await expect(scopeEditor.getByRole('alert')).toContainText('/reactions/1/watch/0');
  await scopeEditor.getByRole('button', { name: '取消', exact: true }).click();
  await button('取消').click();
  expect(compactJson(await (await schemaSource(page)).inputValue())).toBe(
    compactJson(input.replace(rule, valid)),
  );

  const ambiguous = input.replace(
    rule,
    valid.replace('"as":"covered"', '"as":"first","as":"covered"'),
  );
  await accepted.fill(ambiguous);
  await button('联动').click();
  await page
    .locator('article')
    .filter({ hasText: 'editable' })
    .getByRole('button', { name: '在 JSON 中定位' })
    .click();
  const repair = await schemaSource(page);
  await expect(repair).toBeVisible();
  expect(compactJson(await repair.inputValue())).toBe(compactJson(ambiguous));
});

test('edits a data-independent rule in an empty draft and drags repeated actions without losing their order', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1050 });
  await openSchemaDraft(page, '{}');
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('联动').click();
  await button('添加联动').click();
  await page.getByLabel('规则名称', { exact: true }).fill('notify');
  const event = (name: string) => ({ type: 'host.emit', event: name });
  const dialog = page.getByRole('dialog', { name: '添加联动', exact: true });
  await dialog.getByRole('tab', { name: 'JSON 编辑' }).click();
  await dialog.getByRole('textbox', { name: '规则 JSON' }).fill(
    JSON.stringify({
      id: 'notify',
      watch: [],
      then: [event('first'), event('repeat'), event('repeat')],
    }),
  );
  await dialog.getByRole('tab', { name: '表单编辑' }).click();
  const actions = page.getByRole('region', { name: '规则配置' }).getByRole('listitem');
  const source = actions.first();
  const target = actions.nth(2);
  await target.scrollIntoViewIfNeeded();
  await source.hover({ position: { x: 16, y: 16 } });
  const origin = await source.boundingBox();
  const destination = await target.boundingBox();
  if (!origin || !destination) throw Error('Action rows must be visible for dragging.');

  // Cross the native drag threshold within the source row before moving to the drop target.
  await page.mouse.down();
  await page.mouse.move(origin.x + 30, origin.y + 16, { steps: 4 });
  await page.mouse.move(destination.x + 30, destination.y + 16, { steps: 8 });
  await page.mouse.move(destination.x + 35, destination.y + 16);
  await page.mouse.up();
  await expect(actions.first()).toContainText(/通知宿主.*repeat/);
  await button('完成规则').click();
  const raw = await schemaSource(page);
  expect(JSON.parse(await raw.inputValue())).toEqual({
    reactions: [
      { id: 'notify', watch: [], then: [event('repeat'), event('repeat'), event('first')] },
    ],
  });
  await button('撤销').click();
  expect(JSON.parse(await raw.inputValue())).toEqual({});
});

test('新增与编辑共用右侧抽屉，完成回到原卡片，取消丢弃修改', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openSchemaDraft(
    page,
    JSON.stringify({
      id: 'trial',
      version: '1',
      protocolVersion: '1',
      data: { schema: { type: 'object' } },
      views: { desktop: { material: 'section' } },
    }),
  );
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button('联动').click();
  await button('添加联动').click();
  const drawer = page.getByRole('dialog', { name: '添加联动', exact: true });
  const box = await drawer.boundingBox();
  expect(box?.width).toBe(840);
  expect(box!.x + box!.width).toBe(1440);
  await drawer.getByLabel('规则名称').fill('通知规则');
  await drawer.getByRole('tab', { name: 'JSON 编辑' }).click();
  await drawer.getByRole('textbox', { name: '规则 JSON' }).fill(
    JSON.stringify({
      id: '通知规则',
      watch: [],
      runOnActivate: true,
      when: true,
      then: [{ type: 'host.emit', event: 'demo.ready' }],
    }),
  );
  await button('完成规则').click();
  const card = page
    .locator('.reaction-list article')
    .filter({ has: page.getByRole('heading', { name: '通知规则' }) });
  await expect(card.getByText('真', { exact: true })).toBeVisible();
  await expect(card.getByText('通知宿主 demo.ready')).toBeVisible();
  await expect(button('编辑 通知规则')).toBeFocused();
  await button('编辑 通知规则').click();
  await page.getByLabel('规则名称').fill('取消这一改名');
  await button('取消').click();
  await expect(button('编辑 通知规则')).toBeFocused();
  await button('编辑 通知规则').click();
  await page.getByLabel('规则名称').fill('新名称');
  await button('完成规则').click();
  await expect(button('编辑 新名称')).toBeFocused();
  await button('添加联动').click();
  await expect(drawer).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(button('添加联动')).toBeFocused();
  await button('保存配置').click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.reload();
  await button('联动').click();
  await expect(button('编辑 新名称')).toBeVisible();
  await expect(page.getByText('通知宿主 demo.ready')).toBeVisible();
});
