import { expect, test } from '@playwright/test';
import {
  diagnosticForms,
  formDefinition,
} from '../../../services/api/test/fixtures/diagnostic-corpus';

test('shows linked PR information without local review controls', async ({ page }) => {
  test.skip(
    process.env.PLATFORM_DIAGNOSTICS_STUDIO_PILOT !== '1' ||
      process.env.PLATFORM_ASSET_REPAIR_REPOSITORY !== 'local-testing/form-assets',
    'Requires the local diagnostic pilot and test repository',
  );
  test.setTimeout(60_000);
  await page.goto('/');
  const login = page.getByRole('button', { name: '使用账号密码登录', exact: true });
  await expect(page.getByLabel('用户名', { exact: true }).or(login)).toBeVisible();
  if (await login.isVisible()) await login.click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码').fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('navigation', { name: '主导航' })).toBeVisible();

  const origin = new URL(page.url()).origin;
  const post = (path: string, data: object, extra?: Record<string, string>) =>
    page.request.post('/api/platform/' + path, {
      headers: { Origin: origin, 'Idempotency-Key': crypto.randomUUID(), ...extra },
      data,
    });
  const form = await post('forms', { name: '物料修复试点表单' });
  expect(form.status()).toBe(201);
  const { formId } = await form.json();
  const saved = await post('forms/' + formId + '/versions', {
    text: JSON.stringify(formDefinition(diagnosticForms[0]!)),
  });
  expect(saved.status()).toBe(201);
  const { versionId } = await saved.json();
  const published = await post('forms/' + formId + '/releases', { versionId, profile: 'main' });
  expect(published.status()).toBe(201);
  const { releaseId, success } = await published.json();
  expect(success).toBe(true);
  const release = (await (await page.request.get('/api/platform/releases/' + releaseId)).json())
    .preparedText;
  const artifact = JSON.parse(release);
  const { owner } = await (await page.request.get('/api/platform/diagnostics/pilot')).json();
  const intake = await post(
    'diagnostics/pilot/events',
    {
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      releaseId,
      occurredAt: new Date().toISOString(),
      source: 'renderer',
      errorCode: 'MATERIAL_UNAVAILABLE',
      phase: 'render',
      targetId: artifact.definition.views.main.id,
      targetKind: 'material_node',
      evidenceStatus: 'captured',
      evidence: { message: 'synthetic material failure, with private host context' },
    },
    { 'X-Diagnostic-Owner': owner },
  );
  expect(intake.status()).toBe(201);
  const { diagnosticId } = await intake.json();

  await page.goto('/diagnostics?event=' + diagnosticId);
  const summary = page.getByRole('region', { name: '错误摘要' });
  await expect(summary.getByRole('heading', { name: '表单物料无法装载' })).toBeVisible();
  await expect(
    summary.getByText('synthetic material failure, with private host context'),
  ).toBeVisible();
  await expect(summary.getByText(/先核对宿主是否注册/)).toBeVisible();
  await page.getByRole('button', { name: '创建资产修复任务' }).click();
  const dialog = page.getByRole('dialog', { name: '创建资产修复任务' });
  await expect(
    dialog.getByText(artifact.capabilityLock.materials.section.artifact.digest),
  ).toBeVisible();
  await dialog.getByRole('button', { name: '确认创建任务' }).click();
  await page.getByRole('link', { name: '打开资产修复任务' }).click();
  const task = page.getByRole('region', { name: '资产修复详情' });
  await expect(task.getByText('待认领', { exact: true })).toBeVisible();
  await expect(task.getByRole('link', { name: '表单物料无法装载' })).toBeVisible();
  await expect(task.getByText('private host context', { exact: false })).toHaveCount(0);
  await expect(task.getByText('暂无关联的 GitHub PR')).toBeVisible();
  await expect(task.getByRole('button')).toHaveCount(0);
  const taskId = new URL(page.url()).searchParams.get('task');
  const actions = 'asset-repairs/' + taskId + '/actions';
  expect((await post(actions, { action: 'claim', revision: 0 })).status()).toBe(200);
  const prUrl = 'https://github.com/local-testing/form-assets/pull/42';
  expect(
    (
      await post(actions, {
        action: 'submit',
        revision: 1,
        pullRequest: {
          url: prUrl,
          headSha: 'a'.repeat(40),
          version: artifact.capabilityLock.materials.section.version.replace(
            /\d+$/,
            (value: string) => String(Number(value) + 1),
          ),
        },
      })
    ).status(),
  ).toBe(200);
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(task.getByRole('link', { name: 'PR #42' })).toHaveAttribute('href', prUrl);
  await expect(task.getByRole('button')).toHaveCount(0);
  await expect(task.getByRole('textbox')).toHaveCount(0);
  await page.getByRole('button', { name: '返回任务列表' }).click();
  await expect(
    page.getByRole('table', { name: '资产修复任务列表' }).getByText('待人工审查'),
  ).toBeVisible();
  await page.getByRole('tab', { name: 'PR 审查' }).click();
  const reviews = page.getByRole('table', { name: 'PR 审查列表' });
  await expect(reviews.getByRole('link', { name: '#42' })).toHaveAttribute(
    'href',
    'https://github.com/local-testing/form-assets/pull/42',
  );
  await reviews.getByRole('button', { name: /打开资产修复任务/ }).click();
  await page.getByRole('button', { name: '返回 PR 审查列表' }).click();
  await expect(reviews).toBeVisible();

  await page.route('**/api/platform/asset-repairs/reviews', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), repository: null } });
  });
  await page.getByRole('button', { name: '刷新', exact: true }).click();
  await expect(page.getByText('尚未配置资产代码仓库。')).toBeVisible();
  await expect(page.getByText('暂无关联的 GitHub PR。')).toBeVisible();
  await expect(reviews.getByRole('link', { name: '#42' })).toHaveCount(0);
});

test('paginates and filters tasks and linked PRs independently', async ({ page, baseURL }) => {
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  await page.setViewportSize({ width: 1418, height: 650 });
  const repository = 'local-testing/form-assets';
  const tasks = Array.from({ length: 13 }, (_, index) => ({
    id: crypto.randomUUID(),
    formId: crypto.randomUUID(),
    versionId: crypto.randomUUID(),
    releaseId: crypto.randomUUID(),
    formName: '修复表单 ' + (index + 1),
    kind: 'material',
    asset: {
      id: 'material-' + (index + 1),
      version: '1.0.0',
      manifestDigest: 'manifest',
      artifact: { id: 'materials', platform: 'web', digest: 'artifact' },
    },
    status: index === 12 ? 'in_review' : 'open',
    githubStatus: index === 12 ? 'merged' : 'open',
    pullRequest: { url: 'https://github.com/' + repository + '/pull/' + (101 + index) },
  }));
  await page.route('**/api/platform/asset-repairs', (route) => route.fulfill({ json: tasks }));
  await page.route('**/api/platform/asset-repairs/reviews', (route) =>
    route.fulfill({ json: { repository, rows: tasks } }),
  );
  await page.route('**/api/platform/asset-repairs/' + tasks[12]!.id, (route) =>
    route.fulfill({ json: { ...tasks[12], repository, occurrences: [] } }),
  );

  await page.goto('/?page=asset-repairs');
  const taskTable = page.getByRole('table', { name: '资产修复任务列表' });
  const pagination = page.getByRole('navigation', { name: '分页' });
  const footerGap = () =>
    pagination.evaluate((el) => {
      const footer = el.closest('.studio-table-layout-footer')!;
      const main = el.closest('main')!;
      return Math.abs(main.getBoundingClientRect().bottom - footer.getBoundingClientRect().bottom);
    });
  await expect.poll(footerGap).toBeLessThan(2);
  await expect(taskTable.locator('tbody tr')).toHaveCount(10);
  await pagination.getByRole('button', { name: '下一页' }).click();
  await expect(taskTable.locator('tbody tr')).toHaveCount(3);
  await expect(pagination).toContainText('第 2 / 2 页，共 13 条');
  await taskTable.getByRole('button', { name: '打开资产修复任务 material-13' }).click();
  await page.getByRole('button', { name: '返回任务列表' }).click();
  await expect(pagination).toContainText('第 2 / 2 页，共 13 条');

  const taskFilters = page.getByRole('search', { name: '筛选资产修复任务列表' });
  await taskFilters.getByRole('combobox', { name: '任务状态' }).click();
  await page.getByRole('option', { name: '待人工审查', exact: true }).click();
  await taskFilters.getByRole('button', { name: '确认' }).click();
  await expect(pagination).toContainText('第 1 / 1 页，共 1 条');
  await expect(taskTable.locator('tbody tr')).toContainText('material-13');

  await page.getByRole('tab', { name: 'PR 审查' }).click();
  const reviewTable = page.getByRole('table', { name: 'PR 审查列表' });
  const reviewFilters = page.getByRole('search', { name: '筛选PR 审查列表' });
  await expect(reviewTable.locator('tbody tr')).toHaveCount(10);
  await pagination.getByRole('combobox', { name: '每页条数' }).click();
  await page.getByRole('option', { name: '20', exact: true }).click();
  await expect(reviewTable.locator('tbody tr')).toHaveCount(13);
  const footerBeforeScroll = await pagination.boundingBox();
  const filtersBeforeScroll = await reviewFilters.boundingBox();
  const results = page.getByRole('region', { name: 'PR 审查列表', exact: true });
  expect(
    await results.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
      return el.scrollTop;
    }),
  ).toBeGreaterThan(0);
  expect(await pagination.boundingBox()).toEqual(footerBeforeScroll);
  expect(await reviewFilters.boundingBox()).toEqual(filtersBeforeScroll);
  await expect.poll(footerGap).toBeLessThan(2);
  await reviewFilters.getByRole('combobox', { name: 'GitHub 状态' }).click();
  await page.getByRole('option', { name: '已合并', exact: true }).click();
  const reviewSearch = reviewFilters.getByRole('searchbox', { name: '搜索资产、表单或 PR' });
  await reviewSearch.fill('#113');
  await reviewSearch.press('Enter');
  await expect(reviewTable.getByRole('link', { name: '#113' })).toBeVisible();
  await expect(pagination).toContainText('共 1 条');
  await expect.poll(footerGap).toBeLessThan(2);
  await reviewSearch.fill('没有匹配的编号');
  await reviewSearch.press('Enter');
  await expect(page.getByText('没有匹配的结果。', { exact: false })).toBeVisible();
  await reviewFilters.getByRole('button', { name: '重置' }).click();
  await expect(reviewTable.locator('tbody tr')).toHaveCount(13);
  await page.getByRole('tab', { name: '任务列表' }).click();
  await expect(taskTable.locator('tbody tr')).toHaveCount(1);
});
