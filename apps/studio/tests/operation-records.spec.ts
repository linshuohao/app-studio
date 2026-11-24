import { expect, test, type Page } from '@playwright/test';
async function post(page: Page, base: string, path: string, data: object) {
  const r = await page.request.post(base + '/api/platform' + path, {
    data,
    headers: { Origin: base, 'Idempotency-Key': crypto.randomUUID() },
  });
  expect(r.ok(), await r.text()).toBeTruthy();
  return r.status() === 204 ? null : r.json();
}
test('same-name release records link to the exact two versions and releases', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base = baseURL!;
  await post(page, base, '/login', {
    username: 'studio-test',
    password: 'local-browser-test-password',
  });
  const { formId } = await post(page, base, '/forms', { name: '记录核对' });
  const path = '/forms/' + formId;
  let parent = null;
  const records = [];
  for (const name of ['春季配置', '秋季配置']) {
    const text = JSON.stringify({
      protocolVersion: '1',
      id: 'audit',
      version: '1',
      data: { schema: { type: 'object' } },
      views: { main: { material: 'section', props: { title: name } } },
    });
    const { versionId } = await post(page, base, path + '/versions', {
      text,
      basedOnVersionId: parent,
      name,
    });
    parent = versionId;
    const { releaseId } = await post(page, base, path + '/releases', {
      versionId,
      name: '同名发布',
      profile: 'main',
    });
    records.push({ versionId, releaseId, name });
  }
  await page.goto('/?form=' + formId + '&tab=config');
  for (const row of records) {
    for (const target of ['配置版本', '发布详情']) {
      await page.getByRole('button', { name: '操作记录', exact: true }).click();
      const d = page.getByRole('dialog', { name: '表单操作记录' });
      await d.getByRole('combobox', { name: '筛选动作' }).click();
      await page.getByRole('option', { name: '发布表单', exact: true }).click();
      await d.getByLabel('开始日期').fill('2099-01-01');
      await d.getByRole('button', { name: '确认', exact: true }).click();
      await expect(d.getByText('没有符合条件的记录。')).toBeVisible();
      await d.getByLabel('开始日期').fill('');
      await d.getByRole('button', { name: '确认', exact: true }).click();
      expect(
        await d.evaluate(
          (el) =>
            el.scrollWidth <= el.clientWidth && document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      const rows = d.locator('.operation-item');
      await expect(rows).toHaveCount(2);
      const entry = rows.nth(records.indexOf(row) === 0 ? 1 : 0);
      await entry.locator('.operation-line').click();
      await expect(entry.getByText(row.releaseId, { exact: true })).toBeVisible();
      await expect(entry.getByText(row.versionId, { exact: true })).toBeVisible();
      await entry.getByRole('button', { name: '打开' + target }).click();
      if (target === '配置版本') {
        await expect(page).toHaveURL(
          (url) =>
            (url.searchParams.get('version') ?? url.searchParams.get('snapshot')) === row.versionId,
        );
        await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
        await page.getByRole('button', { name: '格式化文本', exact: true }).first().click();
        await expect(page.getByLabel('配置原文', { exact: true })).toHaveValue(
          new RegExp(row.name),
        );
      } else {
        await expect(page).toHaveURL(new RegExp('release=' + row.releaseId));
        await expect(
          page.getByRole('link', { name: '在示例 Host 中打开', exact: true }),
        ).toHaveAttribute('href', '/host?releaseId=' + row.releaseId);
        await page
          .getByRole('button', { name: '查看配置版本 ' + row.versionId, exact: true })
          .click();
        await expect(page).toHaveURL(new RegExp('version=' + row.versionId));
        await page.getByRole('button', { name: '返回发布记录' }).click();
        await expect(page).toHaveURL(new RegExp('release=' + row.releaseId));
      }
      await page.getByRole('button', { name: '返回操作记录', exact: true }).click();
      await expect(entry.getByRole('button', { name: '打开' + target })).toBeFocused();
      await expect(d.getByRole('combobox', { name: '筛选动作' })).toContainText('发布表单');
      await d.getByRole('button', { name: '关闭', exact: true }).click();
    }
  }
});
test('admin reads role transition, ordinary member is denied and sees only own security history', async ({
  page,
  browser,
  baseURL,
}) => {
  const base = baseURL!,
    username = 'log-' + crypto.randomUUID().slice(0, 8),
    password = 'fixture-test-password';
  await post(page, base, '/login', {
    username: 'studio-test',
    password: 'local-browser-test-password',
  });
  const member = await post(page, base, '/members', {
    username,
    password,
    createAccount: true,
    identityVerified: true,
    roles: ['viewer'],
  });
  await post(page, base, '/members/' + member.memberId, {
    revision: member.revision,
    active: true,
    roles: ['editor'],
  });
  await page.goto('/?page=members');
  await page.getByRole('button', { name: username + '的操作记录', exact: true }).click();
  const d = page.getByRole('dialog', { name: '成员操作记录' });
  await d.getByRole('combobox', { name: '筛选动作' }).click();
  await page.getByRole('option', { name: '变更角色' }).click();
  await d.getByRole('button', { name: '确认', exact: true }).click();
  await d.locator('.operation-line').click();
  await expect(d.getByText('角色 · 查看者 → 编辑者')).toBeVisible();
  const id = await d.locator('code').first().innerText();
  const ctx = await browser.newContext({ baseURL: base });
  try {
    const user = await ctx.newPage();
    await post(user, base, '/login', { username, password });
    const path = '/api/platform/members/' + member.memberId + '/operations';
    for (const suffix of ['', '?id=' + id, '?cursor=bad'])
      expect((await user.request.get(path + suffix)).status()).toBe(403);
    await user.goto('/?page=members');
    await expect(user.getByRole('button', { name: '编辑成员 ' + username })).toHaveCount(0);
    await post(user, base, '/password', { currentPassword: password, password: password + '-new' });
    await user.goto('/?page=account');
    await user.getByRole('button', { name: '安全记录' }).click();
    const sec = user.getByRole('dialog', { name: '账号安全记录' });
    await sec.getByRole('combobox', { name: '筛选结果' }).click();
    await user.getByRole('option', { name: '失败', exact: true }).click();
    await sec.getByRole('button', { name: '确认', exact: true }).click();
    await expect(sec.getByText('没有符合条件的记录。')).toBeVisible();
    await sec.getByRole('combobox', { name: '筛选结果' }).click();
    await user.getByRole('option', { name: '成功', exact: true }).click();
    await sec.getByRole('button', { name: '确认', exact: true }).click();
    await sec.getByRole('button', { name: /修改密码/ }).click();
    await expect(sec.getByText(/记录 ID/)).toBeVisible();
    expect(await sec.innerText()).not.toContain(password);
  } finally {
    await ctx.close();
  }
});
test('paged form history retains distinct records on a narrow screen', async ({
  page,
  baseURL,
}) => {
  const base = baseURL!;
  await post(page, base, '/login', {
    username: 'studio-test',
    password: 'local-browser-test-password',
  });
  const { formId } = await post(page, base, '/forms', { name: '归档与恢复记录' });
  for (let i = 0; i < 22; i++)
    await post(page, base, '/forms/' + formId + '/' + (i % 2 ? 'restore' : 'archive'), {});
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?form=' + formId + '&tab=config');
  await page.getByRole('button', { name: '操作记录', exact: true }).click();
  const d = page.getByRole('dialog', { name: '表单操作记录' });
  await expect(d.locator('.operation-item')).toHaveCount(20);
  await d.getByRole('button', { name: '下一页' }).click();
  await expect(d.locator('.operation-item')).toHaveCount(3);
  await d.getByRole('button', { name: /创建表单/ }).click();
  await expect(d.getByText(/记录 ID/)).toBeVisible();
  expect(
    await d.evaluate(
      (el) => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth,
    ),
  ).toBe(true);
  await d.getByRole('button', { name: '返回首页' }).click();
  await expect(d.locator('.operation-item')).toHaveCount(20);
});
