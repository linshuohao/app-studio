import { expect, test } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';
import { basicDefinition } from '../../playground/src/demos/basic/definition';
import { schemaSource } from './data-schema-fixture';
import { chooseWorkingVersionAction } from './working-version-menu';
import {
  chooseWorkingPublication,
  createWorkingVersion,
  saveWorkingConfig,
  workingVersionRow,
} from './working-version-fixture';

test('edits JSON nodes, validates and compresses saves, and restores exact routes', async ({
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
  await page.getByLabel('表单名称').fill('节点编辑验收');
  await page.getByRole('button', { name: '创建表单' }).click();
  await createWorkingVersion(page, '节点编辑草稿');
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await expect(page.getByRole('region', { name: '配置原文' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '配置原文' })).toHaveCount(0);
  await page.getByRole('button', { name: '导入 JSON', exact: true }).click();
  await page
    .getByLabel('粘贴 JSON')
    .fill('{"n":9007199254740993,"n":-0,"obj":{"title":"旧值"},"items":[]}');
  await page.getByRole('button', { name: '校验并导入' }).click();
  await page.getByRole('button', { name: '编辑 /obj/title', exact: true }).click();
  await page.getByLabel('属性名称').fill('name');
  await page.getByLabel('值', { exact: true }).fill('新值');
  await page.getByRole('button', { name: '应用修改' }).click();
  await page.getByRole('button', { name: '添加到 /items', exact: true }).click();
  await page.getByLabel('值类型').click();
  await page.getByRole('option', { name: '数字', exact: true }).click();
  await page.getByLabel('值', { exact: true }).fill('01');
  await page.getByRole('button', { name: '应用修改' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('有效 JSON 数字');
  await page.getByLabel('值', { exact: true }).fill('42');
  await page.getByRole('button', { name: '应用修改' }).click();
  await page.getByRole('button', { name: '撤销', exact: true }).click();
  await page.getByRole('button', { name: '重做', exact: true }).click();
  await page.getByRole('button', { name: '编辑 /obj', exact: true }).click();
  await expect(page.getByLabel('对象 JSON')).toHaveValue('{\n    "name": "新值"\n}\n');
  await page.getByLabel('对象 JSON').fill('[]');
  await page.getByRole('button', { name: '应用修改' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('请输入 JSON 对象');
  await page.getByLabel('对象 JSON').fill('{"name":"整块修改","nested":{"enabled":true}}');
  await page.getByRole('button', { name: '格式化节点 JSON' }).click();
  await expect(page.getByLabel('对象 JSON')).toHaveValue(/\n/);
  await page.getByRole('button', { name: '应用修改' }).click();
  const request = page.waitForRequest(
    (r) => r.method() === 'POST' && r.url().endsWith('/versions'),
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  expect((await request).postDataJSON().text).toBe(
    '{"n":9007199254740993,"n":-0,"obj":{"name":"整块修改","nested":{"enabled":true}},"items":[42]}',
  );
  await expect(page.getByText('已保存', { exact: true })).toBeVisible();
  const formId = new URL(page.url()).searchParams.get('form');
  const workUrl = page.url();
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await chooseWorkingVersionAction(page, '保存历史');
  await page
    .getByRole('dialog', { name: '保存历史' })
    .getByRole('button', { name: '查看快照' })
    .click();
  await expect(page).toHaveURL(/tab=history&version=/);
  const historyUrl = page.url();
  await page.reload();
  await expect(page.getByText('只读配置', { exact: true })).toBeVisible();
  expect(page.url()).toBe(historyUrl);
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await expect(page.getByRole('region', { name: '配置原文' })).toBeVisible();
  await expect(page.getByRole('button', { name: '编辑 /obj/name', exact: true })).toHaveCount(0);
  await page.goto(workUrl);
  const editor = await schemaSource(page);
  await editor.fill('{"bad":');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByText('JSON 格式无效，请修复后再保存。')).toBeVisible();
  const version = await saveWorkingConfig(
    page,
    JSON.stringify({
      ...basicDefinition,
      views: { desktop: basicDefinition.views.main, mobile: basicDefinition.views.main },
    }),
  );
  await page.getByRole('button', { name: '返回版本列表' }).click();
  const publish = await chooseWorkingPublication(page, '节点编辑草稿');
  await expect(publish.getByRole('button', { name: '确认发布' })).toBeDisabled();
  await publish.getByLabel('发布名称', { exact: true }).fill('节点编辑首版');
  await publish.getByRole('combobox', { name: 'Web 视图' }).click();
  await page.getByRole('option', { name: 'desktop', exact: true }).click();
  await publish.getByRole('button', { name: '确认发布' }).click();
  const row = workingVersionRow(page, '节点编辑草稿');
  await expect(row.getByText(/已发布/)).toBeVisible();
  await chooseWorkingVersionAction(page, '查看本次发布', row);
  await expect(page.getByRole('heading', { name: '节点编辑首版', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: `查看配置版本 ${version}` })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('form')).toBe(formId);
  const url = page.url();
  await page.reload();
  await expect(page.getByRole('link', { name: '在示例 Host 中打开' })).toBeVisible();
  expect(page.url()).toBe(url);
  const unknown = new URL(url);
  unknown.searchParams.set('release', 'not-found');
  await page.goto(unknown.href);
  await expect(page.getByText('找不到指定发布记录，请选择其他记录。')).toBeVisible();
  await expect(page.getByRole('link', { name: '在示例 Host 中打开' })).toHaveCount(0);
});

test('ignores a late form response after Back and keeps directory deep links readable', async ({
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
  await page.getByLabel('表单名称').fill('导航竞态验收');
  await page.getByRole('button', { name: '创建表单' }).click();
  await expect(page.getByRole('heading', { name: '导航竞态验收' })).toBeVisible();
  const id = new URL(page.url()).searchParams.get('form');
  await page.getByRole('button', { name: '返回表单列表' }).click();
  let release!: () => void;
  const hold = new Promise<void>((resolve) => (release = resolve));
  const path = '**/api/platform/forms/' + id;
  await page.route(
    path,
    async (route) => {
      const response = await route.fetch();
      await hold;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const requested = page.waitForRequest(path);
  await page.getByRole('button', { name: '打开 导航竞态验收' }).click();
  await requested;
  await page.goBack();
  await expect(page.getByRole('heading', { name: '表单列表' })).toBeVisible();
  await expect(page.getByRole('button', { name: '新建表单' })).toBeEnabled();
  const complete = page.waitForResponse(path);
  release();
  await complete;
  await expect(page.getByRole('heading', { name: '表单列表' })).toBeVisible();
  await page.getByRole('button', { name: '纯函数', exact: true }).click();
  await page.getByRole('searchbox', { name: '搜索资产' }).fill('加法');
  await page.getByRole('searchbox', { name: '搜索资产' }).press('Enter');
  await page.getByRole('button', { name: '查看 core.add', exact: true }).click();
  const detail = page.url();
  await page.reload();
  await expect(page.getByRole('heading', { name: '加法', exact: true })).toBeVisible();
  expect(page.url()).toBe(detail);
  await expect(page.getByRole('heading', { name: '调用示例' })).toBeVisible();
  await page.getByRole('button', { name: '配置示例', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '配置示例' })).toBeVisible();
  await page
    .getByRole('dialog', { name: '配置示例' })
    .getByRole('button', { name: '关闭' })
    .click();
  await page
    .locator('.studio-navigation')
    .getByRole('button', { name: '表单', exact: true })
    .click();
  await page.route('**/api/platform/forms', (route) => route.fulfill({ status: 503 }), {
    times: 1,
  });
  await page.reload();
  await expect(page.getByRole('button', { name: '重新加载列表' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '登录表单工作台' })).toHaveCount(0);
  await page.getByRole('button', { name: '重新加载列表' }).click();
  await expect(page.getByRole('button', { name: '打开 导航竞态验收' })).toBeVisible();
});

test('keeps every page within narrow and wide viewports with long titles and JSON', async ({
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
  await expect(page.getByRole('heading', { name: '表单列表', exact: true })).toBeVisible();
  const headers = { Origin: new URL(page.url()).origin, 'idempotency-key': crypto.randomUUID() };
  const created = await page.request.post('/api/platform/forms', {
    headers,
    data: { name: '宽度边界验证'.repeat(12) },
  });
  expect(created.ok()).toBeTruthy();
  const { formId } = await created.json();
  const saved = await page.request.post(`/api/platform/forms/${formId}/versions`, {
    headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
    data: {
      text: JSON.stringify({
        ...travelDefinition,
        views: { desktop: travelDefinition.views.desktop },
      }),
      basedOnVersionId: null,
      note: '长备注边界'.repeat(35),
    },
  });
  expect(saved.ok()).toBeTruthy();
  const { versionId } = await saved.json();
  const published = await page.request.post(`/api/platform/forms/${formId}/releases`, {
    headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
    data: { versionId, profile: 'desktop', name: '发布名称边界验收'.repeat(10) },
  });
  const { releaseId } = await published.json();
  expect(releaseId).toBeTruthy();
  test.setTimeout(60000);
  const draftResponse = await page.request.post('/api/platform/forms/' + formId + '/work', {
    headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
    data: { name: '继续编辑长字段', source: versionId },
  });
  expect(draftResponse.ok()).toBeTruthy();
  const { id: work } = await draftResponse.json();
  const routes = [
    '/',
    '/?catalog=materials',
    '/?catalog=materials&asset=remote-select',
    '/?catalog=functions',
    '/?catalog=functions&asset=core.add',
    '/?page=members',
    '/?page=account',
    `/?form=${formId}`,
    `/?form=${formId}&work=${work}`,
    `/?form=${formId}&tab=history&version=${versionId}`,
    `/?form=${formId}&tab=releases&release=${releaseId}`,
    `/host?releaseId=${releaseId}`,
  ];
  for (const [width, height] of [
    [1440, 900],
    [1024, 768],
    [768, 600],
    [390, 844],
    [360, 800],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await page.goto(route);
      if (route.includes('/host'))
        await expect(page.getByRole('region', { name: '已装载实例' })).toBeVisible();
      else if (route.includes('tab=releases'))
        await expect(page.getByRole('link', { name: '在示例 Host 中打开' })).toBeVisible();
      else if (route.includes('tab=history'))
        await expect(page.getByText('只读配置', { exact: true })).toBeVisible();
      else if (route === '/?form=' + formId)
        await expect(page.getByRole('button', { name: '版本列表', exact: true })).toBeVisible();
      else if (route.includes('&work=')) {
        await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
        const editViews = page.getByRole('button', { name: '编辑 /views', exact: true });
        await editViews.scrollIntoViewIfNeeded();
        await editViews.click({ timeout: 5000 });
        await expect(page.getByLabel('对象 JSON')).toHaveValue(/\n    /);
        const box = await page.getByRole('dialog').evaluate((el) => {
          const b = el.getBoundingClientRect();
          return { width: b.width, height: b.height, left: b.left, top: b.top };
        });
        expect(box.width).toBeLessThan(width);
        expect(box.height).toBeLessThan(height);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.top).toBeGreaterThanOrEqual(0);
        await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click();
      } else if (route.includes('asset=remote-select'))
        await expect(page.getByRole('heading', { name: '物料契约' })).toBeVisible();
      else if (route.includes('asset='))
        await expect(page.getByRole('heading', { name: '调用示例' })).toBeVisible();
      else if (route.includes('catalog=materials')) {
        const search = page.getByRole('searchbox', { name: '搜索资产' });
        await search.fill('remote-select');
        await search.press('Enter');
        await expect(
          page.getByRole('button', { name: '查看 remote-select', exact: true }),
        ).toBeVisible();
      } else if (route.includes('catalog=functions'))
        await expect(page.getByRole('heading', { name: '纯函数目录', exact: true })).toBeVisible();
      else if (route.includes('page=members'))
        await expect(page.getByRole('button', { name: '编辑成员 studio-test' })).toBeVisible();
      else if (route.includes('page=account'))
        await expect(page.getByRole('heading', { name: '当前访问权限' })).toBeVisible();
      else
        await expect(
          page.getByRole('button', { name: '打开 ' + '宽度边界验证'.repeat(12), exact: true }),
        ).toBeVisible();
      await expect
        .poll(
          () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          { message: `No document overflow at ${width}: ${route}` },
        )
        .toBe(true);
      if (width <= 650)
        expect(
          await page
            .locator('.responsive-list,.studio-navigation nav')
            .evaluateAll((els) =>
              els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className),
            ),
        ).toEqual([]);
      const wrapped = await page.getByRole('button').evaluateAll((buttons) =>
        buttons
          .flatMap((button) => {
            // Compact field rows can put the name and its metadata on separate lines.
            const fieldText = [
              ...button.querySelectorAll<HTMLElement>(
                '.studio-field-row-label, .studio-field-row-meta',
              ),
            ];
            return fieldText.length ? fieldText : [button];
          })
          .filter(
            (b) =>
              b.getBoundingClientRect().width > 0 &&
              b.textContent &&
              b.textContent.trim().length < 20 &&
              (() => {
                const boxes: DOMRect[] = [];
                const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
                let node: Node | null;
                while ((node = walker.nextNode())) {
                  if (
                    !node.textContent?.trim() ||
                    node.parentElement?.closest('.sr-only, [aria-hidden="true"]')
                  )
                    continue;
                  const range = document.createRange();
                  range.selectNodeContents(node);
                  for (const rect of Array.from(range.getClientRects())) boxes.push(rect);
                }
                return (
                  boxes.length > 1 &&
                  Math.max(...boxes.map((rect) => rect.top)) >=
                    Math.min(...boxes.map((rect) => rect.bottom)) - 1
                );
              })(),
          )
          .map((b) => b.textContent),
      );
      expect(wrapped).toEqual([]);
    }
  }
});
