import { expect, test } from '@playwright/test';
import { schemaSource } from './data-schema-fixture';

test('filters real catalog categories and renders isolated interactive material previews', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '物料', exact: true }).click();
  const pagination = page.getByRole('navigation', { name: '分页' });
  const next = pagination.getByRole('button', { name: '下一页' });
  const previous = pagination.getByRole('button', { name: '上一页' });
  await expect(pagination).toContainText('第 1 / 4 页，共 19 条');
  await expect(page.locator('.material-card')).toHaveCount(6);
  await expect(page.locator('.material-card-render').first()).toBeVisible();
  await expect(page.locator('.material-card-preview').first()).toHaveAttribute('inert', '');
  for (let pageNumber = 1; pageNumber <= 4; pageNumber++) {
    for (const card of await page.locator('.material-card').all()) {
      await card.scrollIntoViewIfNeeded();
      await expect(card.locator('.material-card-render')).toBeVisible();
    }
    if (pageNumber < 4) await next.click();
  }
  await expect(next).toBeDisabled();
  await previous.click();
  await previous.click();
  await previous.click();
  for (const card of await page.locator('.material-card').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('.material-card-render')).toBeVisible();
  }
  const desktopViewport = page.viewportSize()!;
  for (const viewport of [desktopViewport, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await expect
      .poll(() =>
        page.locator('.material-card-render').evaluateAll((renders) => {
          const scales = renders.map((render) => {
            const frame = render.parentElement!.getBoundingClientRect();
            const bounds = render.getBoundingClientRect();
            const transform = new DOMMatrix(getComputedStyle(render).transform);
            const fits =
              bounds.left >= frame.left - 1 &&
              bounds.top >= frame.top - 1 &&
              bounds.left + render.scrollWidth * transform.a <= frame.right + 1 &&
              bounds.top + render.scrollHeight * transform.d <= frame.bottom + 1;
            return fits && transform.a === transform.d ? transform.a : 0;
          });
          return {
            allFit: scales.every((scale) => scale > 0 && scale <= 1),
          };
        }),
      )
      .toEqual({ allFit: true });
    const cardLayouts = await page.locator('.material-card').evaluateAll((cards) =>
      cards.map((card) => {
        const bounds = card.getBoundingClientRect();
        const heading = card.querySelector('.material-card-heading')!.getBoundingClientRect();
        return {
          height: bounds.height,
          headingOffset: heading.top - bounds.top,
        };
      }),
    );
    expect(new Set(cardLayouts.map((card) => card.height)).size).toBe(1);
    expect(new Set(cardLayouts.map((card) => card.headingOffset)).size).toBe(1);
  }
  await page.setViewportSize(desktopViewport);
  await page.getByLabel('用途分类').click();
  await page.getByRole('option', { name: '输入', exact: true }).click();
  await page.getByLabel('实现技术').click();
  await page.getByRole('option', { name: 'React', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索资产' }).fill('text-input');
  await page.getByRole('searchbox', { name: '搜索资产' }).press('Enter');
  await expect(page.getByRole('button', { name: '查看 text-input', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '查看 section', exact: true })).toHaveCount(0);
  await page.getByLabel('实现技术').click();
  await expect(page.getByRole('option')).toHaveText([/全部技术/, /React/]);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '查看 text-input', exact: true }).click();
  const preview = page.getByRole('region', { name: '物料效果预览' });
  await preview.getByRole('textbox', { name: /姓名/ }).fill('示例修改');
  await page.getByRole('button', { name: '重置示例' }).click();
  await expect(preview.getByRole('textbox', { name: /姓名/ })).toHaveValue('林小满');
  await expect(page.getByRole('navigation', { name: '物料条目' })).toHaveCount(0);
  const propsInfo = page.getByRole('button', { name: '输入属性说明' });
  await propsInfo.click();
  await expect(page.getByRole('dialog', { name: '输入属性说明' })).toContainText('配置表达式求值');
  await page.keyboard.press('Escape');
  await expect(propsInfo).toBeFocused();
  const bindingInfo = page.getByRole('button', { name: '绑定值说明' });
  await bindingInfo.click();
  await expect(page.getByRole('dialog', { name: '绑定值说明' })).toContainText('绑定路径');
  await page.keyboard.press('Escape');
  await expect(bindingInfo).toBeFocused();
  await preview.getByRole('textbox', { name: /姓名/ }).fill('待保留输入');
  await preview.getByText('物料使用配置 · JSON').click();
  const config = preview.getByRole('textbox', { name: '物料使用配置 1' });
  await expect(config).toHaveValue(/"maxLength": 40/);
  await preview.getByRole('tab', { name: '只读展示' }).click();
  await expect(preview.getByRole('textbox', { name: /姓名/ })).not.toBeEditable();
  await expect(config).toHaveValue(/"readOnly": true/);
  await preview.getByRole('tab', { name: '基础输入' }).click();
  await expect(preview.getByRole('textbox', { name: /姓名/ })).toHaveValue('待保留输入');

  const detailHeading = page.getByRole('heading', { name: '文本输入', exact: true });
  const headingTop = (await detailHeading.boundingBox())?.y;
  const scrollBody = page.locator('.material-detail-scroll');
  await scrollBody.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect.poll(() => scrollBody.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect((await detailHeading.boundingBox())?.y).toBe(headingTop);

  const typesButton = page.getByRole('button', { name: '查看类型定义与值示例' });
  await typesButton.click();
  const types = page.getByRole('dialog', { name: '类型定义与值示例' });
  await expect(types).toContainText('type BindingValues');
  await page.keyboard.press('Escape');
  await expect(typesButton).toBeFocused();
  const technicalButton = page.getByRole('button', { name: '技术信息' });
  await technicalButton.click();
  const manifest = page.getByRole('dialog', { name: '技术信息' });
  await manifest.getByRole('button', { name: '格式化文本' }).click();
  await expect(manifest.getByRole('textbox')).toHaveValue(/"id": "text-input"/);
  await expect(manifest.getByRole('textbox')).not.toBeEditable();
  await manifest.getByRole('button', { name: '关闭' }).click();
  await expect(technicalButton).toBeFocused();
  await page.getByRole('button', { name: '返回物料目录' }).click();
  await expect(page.getByRole('searchbox', { name: '搜索资产' })).toHaveValue('text-input');
  await expect(page.getByRole('button', { name: '查看 text-input', exact: true })).toBeFocused();
  const rows = await (await page.request.get('/api/platform/catalog/materials')).json();
  for (const row of rows) {
    await page.goto('/?catalog=materials&asset=' + row.id);
    await expect(preview.locator('.material-preview-canvas:visible')).not.toBeEmpty();
    await expect(preview).not.toContainText('无法启动');
    if (row.id === 'button') {
      await preview.getByRole('button', { name: '保存示例' }).click();
      await expect(preview).toContainText('模拟保存草稿完成');
      const event = page.getByRole('region', { name: '事件 activate' });
      await event.getByRole('button', { name: '查看接入示例' }).click();
      const setup = page.getByRole('dialog', { name: 'activate · 接入示例' });
      await expect(setup).toContainText('createRuntime({');
      await expect(setup.getByRole('textbox', { name: '接入示例配置' })).toHaveValue(
        /"event": "travel.saveDraft"/,
      );
      await page.keyboard.press('Escape');
      await event.getByRole('button', { name: '查看事件契约' }).click();
      await expect(page.getByRole('dialog')).toContainText('activate(): void');
      await page.keyboard.press('Escape');
    }
    if (row.id === 'condition') {
      await preview.getByLabel('显示补充信息').uncheck();
      await expect(preview.getByRole('textbox')).toHaveCount(0);
      await preview.getByLabel('显示补充信息').check();
      await expect(preview.getByRole('textbox')).toBeVisible();
    }
    if (row.id === 'dialog-editor') {
      await preview.getByRole('button', { name: '编辑成员' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('textbox').fill('新成员');
      await page.getByRole('dialog').getByRole('button', { name: '关闭' }).click();
      await expect(preview).toContainText('新成员');
    }
    if (row.id === 'remote-select') {
      await expect(page.getByRole('region', { name: 'Host 请求 search' })).toContainText(
        '搜索框输入的关键词',
      );
      await expect(page.getByRole('region', { name: 'Host 请求 search' })).toContainText(
        'items[].label',
      );
      const hostDocs = page.getByRole('region', { name: 'Host 请求 search' });
      await expect(hostDocs).not.toContainText('完整数据');
      await expect(hostDocs).not.toContainText('点击搜索或按 Enter 调用');
      const requestInfo = hostDocs.getByRole('button', { name: '查看 search Host 请求说明' });
      await requestInfo.click();
      await expect(page.getByRole('dialog', { name: '查看 search Host 请求说明' })).toContainText(
        '点击搜索或按 Enter 调用',
      );
      await page.keyboard.press('Escape');
      await expect(requestInfo).toBeFocused();
      const setup = hostDocs.getByRole('button', { name: '查看接入示例' });
      await setup.click();
      const setupDialog = page.getByRole('dialog', { name: 'search · 接入示例' });
      await expect(setupDialog).toContainText('import { defineHostRequests, FormRenderer }');
      await expect(setupDialog.getByRole('textbox', { name: '接入示例配置' })).toHaveValue(
        /"request": "travel.searchCities"/,
      );
      await page.keyboard.press('Escape');
      await expect(setup).toBeFocused();
      await hostDocs.getByRole('button', { name: '查看类型与值示例' }).click();
      const examples = page.getByRole('dialog', { name: 'search · 类型与值示例' });
      await expect(examples).toContainText('search(payload: RequestInput): Promise<RequestResult>');
      await expect(
        examples.getByRole('textbox', { name: 'search 示例 1', exact: true }),
      ).toHaveValue('{\n    "query": "杭州",\n    "filterKey": "CN"\n}\n');
      await expect(
        examples.getByRole('textbox', { name: 'search 示例 2', exact: true }),
      ).toHaveValue(/"items": \[\n        \{/);
      await page.keyboard.press('Escape');
      await hostDocs.getByRole('button', { name: '查看原始请求契约' }).click();
      await expect(
        page.getByRole('dialog').getByRole('textbox', { name: '原始请求契约' }),
      ).toHaveValue(/"payloadSchema"/);
      await page.keyboard.press('Escape');
      await preview.getByRole('searchbox').fill('杭州');
      await preview.getByRole('button', { name: '搜索', exact: true }).click();
      await expect(preview.getByRole('button', { name: /杭州市/ })).toBeVisible();
      await expect(preview).toContainText('当前选择：未选择');
      await preview.getByRole('button', { name: /杭州市/ }).click();
      await expect(preview).toContainText('当前选择：杭州市');
    }
  }
  await page.getByRole('button', { name: '纯函数', exact: true }).click();
  await page.getByLabel('用途分类').click();
  await page.getByRole('option', { name: '日期', exact: true }).click();
  await page.getByLabel('实现技术').click();
  await page.getByRole('option', { name: 'JavaScript', exact: true }).click();
  await page
    .getByRole('search', { name: '筛选纯函数' })
    .getByRole('button', { name: '确认', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: '查看 date.inclusiveDays', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: '查看 core.add', exact: true })).toHaveCount(0);
});

test('working-version authoring formats text on entry and preserves edits on cancelled return', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('沉浸编辑验收');
  await page.getByRole('button', { name: '创建表单' }).click();
  await page.getByRole('button', { name: '新建草稿' }).click();
  await page.getByLabel('版本名称').fill('配置名称验收');
  await page.getByRole('button', { name: '创建并编辑' }).click();
  await expect(
    page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '表单' }),
  ).toHaveAttribute('aria-current', 'page');
  const source = await schemaSource(page);
  await source.fill('{"precise":9007199254740993,"nested":{"enabled":true}}');
  await page.getByRole('button', { name: '层级编辑', exact: true }).click();
  await page.getByRole('button', { name: '文本查看 / 修复' }).click();
  await expect(source).toHaveValue(
    '{\n    "precise": 9007199254740993,\n    "nested": {\n        "enabled": true\n    }\n}\n',
  );
  const confirmation = page.waitForEvent('dialog');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '返回版本列表' }).click();
  expect((await confirmation).message()).toContain('未保存');
  await expect(page.getByRole('heading', { name: '配置名称验收' })).toBeVisible();
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '保存备注' }).click();
  await page.getByLabel('保存备注（选填）').fill('格式化验收');
  await page
    .getByRole('dialog', { name: '保存备注' })
    .getByRole('button', { name: '关闭' })
    .click();
  const saved = page.waitForResponse(
    (response) => response.url().endsWith('/versions') && response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  const result = await saved;
  expect(result.status()).toBe(201);
  expect(result.request().postDataJSON()).toMatchObject({ note: '格式化验收' });
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '层级编辑', exact: true }).click();
  await page.getByRole('button', { name: '文本查看 / 修复' }).click();
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();
});

test('all installed assets expose complete API structures, field meanings and examples', async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('heading', { name: '表单列表', exact: true })).toBeVisible();
  for (const kind of ['materials', 'functions']) {
    const assets = await (await page.request.get(`/api/platform/catalog/${kind}`)).json();
    for (const asset of assets) {
      await page.goto(`/?catalog=${kind}&asset=${asset.id}`);
      const api = page.getByRole('region', { name: '资产 API' });
      await expect(api).not.toContainText('暂未提供字段说明');
      if (kind === 'materials') {
        await api.getByRole('button', { name: '查看类型定义与值示例' }).click();
        const types = page.getByRole('dialog', { name: '类型定义与值示例' });
        await expect(
          types.locator('.studio-code-block [data-code-token="keyword"]').first(),
        ).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(types).toBeHidden();
      } else {
        await expect(
          api.locator('.studio-code-block code[data-language="typescript"]').first(),
        ).toBeVisible();
        await expect(page.getByLabel('调用参数示例', { exact: true })).toBeVisible();
        await expect(page.getByLabel('返回值示例', { exact: true })).toBeVisible();
      }
      for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const overflow = await page
          .locator('.studio-code-block, .contract-columns .table-scroll')
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => node.scrollWidth > node.clientWidth + 1)
              .map((node) => ({
                selector: node.className,
                text: node.textContent?.slice(0, 100),
                width: node.clientWidth,
                scroll: node.scrollWidth,
                table: node.querySelector('table')?.getBoundingClientRect().width,
                columns: Array.from(node.querySelectorAll('tbody tr:first-child td')).map(
                  (cell) => ({
                    width: cell.getBoundingClientRect().width,
                    whiteSpace: getComputedStyle(cell).whiteSpace,
                    overflowWrap: getComputedStyle(cell).overflowWrap,
                  }),
                ),
              })),
          );
        expect(overflow, `${asset.id} at ${width}px`).toEqual([]);
      }
      if (asset.id === 'travel.requiresGuardian') {
        await expect(api).toContainText('非负安全整数');
        await page.getByRole('button', { name: '更多调用示例' }).click();
        const examples = page.getByRole('dialog', { name: '更多调用示例' });
        await expect(examples.getByLabel('调用参数示例 2', { exact: true })).toHaveValue(/"12"/);
        await expect(examples.getByLabel('返回值示例 2', { exact: true })).toHaveValue(/false/);
        await page.keyboard.press('Escape');
        await expect(examples).toBeHidden();
      }
      if (asset.id === 'select') {
        await expect(api).toContainText('options[].label');
        await expect(api).toContainText('id 字符串');
      }
      if (asset.id === 'remote-select') {
        await expect(api).toContainText('value.id');
        await expect(api).toContainText('value.label');
      }
      if (asset.id === 'travel.totalPremium')
        await expect(api).toContainText('ratePolicy.rates.basic.adultDailyMinor');
      if (asset.id === 'button') {
        await page.getByRole('button', { name: '查看事件契约', exact: true }).click();
        await expect(page.getByRole('dialog')).toContainText('activate(): void');
        await page.keyboard.press('Escape');
      }
    }
  }
});

test('在 Studio 物料目录预览五项表单控件', async ({ page }) => {
  await page.goto('/');
  const passwordLogin = page.getByRole('button', { name: '使用账号密码登录', exact: true });
  const username = page.getByLabel('用户名', { exact: true });
  await expect(username.or(passwordLogin)).toBeVisible();
  if (await passwordLogin.isVisible()) await passwordLogin.click();
  await username.fill('studio-test');
  await page.getByLabel('密码', { exact: true }).fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '物料', exact: true }).click();
  const search = page.getByRole('searchbox', { name: '搜索资产' });
  const preview = page.getByRole('region', { name: '物料效果预览' });
  const cases = [
    [
      'date-picker',
      async () => {
        await preview.getByRole('button', { name: '打开日期日历' }).click();
        await page.locator('[data-day="1990-06-16"] button').click();
        await expect(preview.getByRole('textbox', { name: '出生日期' })).toHaveValue('1990-06-16');
      },
    ],
    [
      'date-range',
      async () => {
        await preview.getByRole('button', { name: '选择日期', exact: true }).click();
        const range = page.getByRole('dialog', { name: '出行日期' });
        await range.getByRole('button', { name: '打开开始日期日历' }).click();
        await range.locator('[data-day="2026-12-02"] button').click();
        await range.getByRole('button', { name: '确认日期' }).click();
        await expect(preview.getByText('2026-12-02', { exact: true })).toBeVisible();
      },
    ],
    [
      'textarea',
      async () => {
        const text = preview.getByRole('textbox', { name: '备注' });
        await text.fill('第一行\n第二行');
        await expect(text).toHaveValue('第一行\n第二行');
      },
    ],
    [
      'radio-group',
      async () => {
        const radio = preview.getByRole('radio', { name: '飞机' });
        await radio.click();
        await expect(radio).toBeChecked();
      },
    ],
    [
      'checkbox-group',
      async () => {
        const checkbox = preview.getByRole('checkbox', { name: '电子邮件' });
        await expect(checkbox).toBeChecked();
        await checkbox.click();
        await expect(checkbox).not.toBeChecked();
      },
    ],
  ] as const;

  for (const [id, exercise] of cases) {
    await search.fill(id);
    await search.press('Enter');
    const open = page.getByRole('button', { name: `查看 ${id}`, exact: true });
    await open.click();
    await exercise();
    await page.getByRole('button', { name: '返回物料目录', exact: true }).click();
    await expect(search).toBeVisible();
    await expect(open).toBeFocused();
  }
});
