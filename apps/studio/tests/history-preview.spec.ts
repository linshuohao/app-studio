import { expect, type Page, test } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';
import { openSchemaDraft, schemaSource } from './data-schema-fixture';
import { basicInformationDefinition } from './basic-information-fixture';
import { chooseWorkingVersionAction } from './working-version-menu';
import {
  chooseWorkingPublication,
  createWorkingVersion,
  saveWorkingConfig as save,
  workingVersionRow,
} from './working-version-fixture';

async function create(page: Page, name: string) {
  await page.goto('/');
  await expect(
    page
      .getByLabel('用户名', { exact: true })
      .or(page.getByRole('button', { name: '使用账号密码登录', exact: true })),
  ).toBeVisible();
  if (await page.getByRole('button', { name: '使用账号密码登录', exact: true }).isVisible())
    await page.getByRole('button', { name: '使用账号密码登录', exact: true }).click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码').fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill(name);
  await page.getByRole('button', { name: '创建表单' }).click();
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
}

async function openPreviewDraft(page: Page, name: string, definition: object) {
  await create(page, name);
  const url = new URL(page.url());
  const formId = url.searchParams.get('form');
  const draft = await page.request.post(`/api/platform/forms/${formId}/work`, {
    headers: { Origin: url.origin, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: '场景草稿', text: JSON.stringify(definition) },
  });
  expect(draft.ok()).toBeTruthy();
  await page.goto(`/?form=${formId}&work=${(await draft.json()).id}`);
}

test('reads exact history, forks a historical snapshot, copies an archived version and restores it', async ({
  page,
}) => {
  await create(page, '历史验收');
  const raw = ' {\n    "不能解析": \n';
  // Cover the read-only and copy paths for historical text that the editor now rejects when saving.
  const formId = new URL(page.url()).searchParams.get('form');
  const legacy = await page.request.post(`/api/platform/forms/${formId}/versions`, {
    headers: { 'idempotency-key': crypto.randomUUID(), Origin: new URL(page.url()).origin },
    data: { text: raw, basedOnVersionId: null },
  });
  expect(legacy.status()).toBe(201);
  const first = (await legacy.json()).versionId;
  const saved = '/?form=' + formId + '&tab=history&version=' + first;
  await page.goto(saved);
  const editor = await schemaSource(page);
  await expect(editor).toHaveValue(raw);
  await expect(editor).not.toBeEditable();
  await expect(page.getByRole('button', { name: '检查配置' })).toHaveCount(0);
  await page.getByRole('button', { name: '预览配置' }).click();
  await expect(page.getByText('JSON_SYNTAX')).toBeVisible();
  await expect(page.getByRole('region', { name: '受控预览' })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭预览' }).click();

  await page.getByRole('button', { name: '返回版本列表' }).click();
  await chooseWorkingVersionAction(page, '基于此版创建新版');
  await page.getByLabel('版本名称', { exact: true }).fill('历史分支');
  await page.getByRole('button', { name: '创建并编辑' }).click();
  const branch = await schemaSource(page);
  const branchUrl = page.url();
  await expect(branch).toHaveValue(raw);
  await expect(branch).toBeEditable();
  const second = await save(page, '{"second":true}');
  const fork = await page.request.get(`/api/platform/forms/${formId}/versions/${second}`);
  expect(fork.ok()).toBeTruthy();
  expect(await fork.json()).toMatchObject({ basedOnVersionId: first });
  await branch.fill('仍需保留的缓冲');
  await page.reload();
  expect(page.url()).toBe(branchUrl);
  await page.getByText('本机草稿（1）', { exact: true }).click();
  await page.getByRole('button', { name: '恢复编辑', exact: true }).click();
  await expect(await schemaSource(page)).toHaveValue('仍需保留的缓冲');
  await save(page, '{"third":true}');
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await page.getByRole('button', { name: '管理表单', exact: true }).click();
  await page.getByRole('menuitem', { name: '归档表单', exact: true }).click();
  await page.getByRole('button', { name: '确认归档', exact: true }).click();

  // The public copy API accepts the exact legacy snapshot after its source is archived.
  const copyBody = { name: '归档复制验收', versionId: first };
  const copyHeaders = {
    'Idempotency-Key': crypto.randomUUID(),
    Origin: new URL(page.url()).origin,
  };
  const copies = `/api/platform/forms/${formId}/copies`;
  const copy = await page.request.post(copies, { headers: copyHeaders, data: copyBody });
  expect(copy.status()).toBe(201);
  const copied = await copy.json();
  const retry = await page.request.post(copies, { headers: copyHeaders, data: copyBody });
  expect(retry.status()).toBe(201);
  expect(await retry.json()).toEqual(copied);
  await page.getByRole('button', { name: '管理表单', exact: true }).click();
  await page.getByRole('menuitem', { name: '恢复表单', exact: true }).click();
  await page.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(page.getByRole('heading', { name: '历史验收', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '管理表单', exact: true }).click();
  await page.getByRole('menuitem', { name: '复制为新表单', exact: true }).click();
  const modal = page.getByRole('dialog', { name: '复制为新表单' });
  await modal.getByLabel('新表单名称').fill('已保存配置副本');
  let copiedVersion: string | undefined;
  await page.route(
    '**' + copies,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      copiedVersion = (await response.json()).versionId;
      await route.abort();
    },
    { times: 1 },
  );
  await modal.getByRole('button', { name: '确认复制' }).click();
  const retryCopy = modal.getByRole('button', { name: '重试复制' });
  await expect(retryCopy).toBeVisible();
  await page.route('**' + copies, (route) => route.fulfill({ status: 403 }), { times: 1 });
  await retryCopy.click();
  await expect(modal.getByRole('alert')).toContainText('当前账号没有操作权限');
  const confirmed = page.waitForResponse((response) => response.url().endsWith(copies));
  await retryCopy.click();
  expect((await (await confirmed).json()).versionId).toBe(copiedVersion);
  await expect(page.getByText(/已创建「已保存配置副本」/)).toBeVisible();
  await page.getByRole('button', { name: '返回表单列表' }).click();
  const copiedForm = page.getByRole('button', { name: '打开 归档复制验收', exact: true });
  await expect(copiedForm).toHaveCount(1);
  await copiedForm.click();
  await chooseWorkingVersionAction(page, '查看配置');
  await expect(await schemaSource(page)).toHaveValue(raw);
  await expect(page).toHaveURL(new RegExp('work=' + copied.versionId));
});

test('discards late checks and runs independent travel previews with simulated Host effects', async ({
  page,
}) => {
  await createRecoveryWork(page, '受控预览验收');
  const editor = page.getByRole('textbox', { name: '配置原文', exact: true });
  const text = JSON.stringify({
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
  });
  await schemaSource(page);
  await editor.fill(text);

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const check = page.getByRole('button', { name: '检查配置' });
  await page.route(
    '**/api/platform/forms/*/check',
    async (route) => {
      const response = await route.fetch();
      expect((await response.json()).success).toBe(true);
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const firstRequest = page.waitForRequest('**/api/platform/forms/*/check');
  await check.click();
  await firstRequest;
  await page.getByRole('button', { name: '关闭检查', exact: true }).click();
  await schemaSource(page);
  await editor.fill('{"invalid":');
  await check.click();
  await expect(page.getByText('JSON_SYNTAX')).toBeVisible();
  const late = page.waitForResponse(
    (response) =>
      response.url().endsWith('/check') && response.request().postDataJSON().text === text,
  );
  release();
  await late;
  await expect(page.getByText('配置检查通过')).toHaveCount(0);
  await page.getByRole('button', { name: '关闭检查', exact: true }).click();

  await schemaSource(page);
  await editor.fill(text);
  const preview = page.getByRole('button', { name: '预览配置' });
  let releasePreview!: () => void;
  const holdPreview = new Promise<void>((resolve) => {
    releasePreview = resolve;
  });
  await page.route(
    '**/api/platform/forms/*/preview',
    async (route) => {
      const response = await route.fetch();
      await holdPreview;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const pendingPreview = page.waitForRequest('**/api/platform/forms/*/preview');
  await preview.click();
  await pendingPreview;
  await page.getByRole('button', { name: '关闭预览' }).click();
  const oldPreview = page.waitForResponse('**/api/platform/forms/*/preview');
  releasePreview();
  await oldPreview;
  await expect(page.getByLabel('受控试填')).toHaveCount(0);

  await preview.click();
  const sandbox = page.getByRole('region', { name: '受控预览' });
  await expect(sandbox.getByText('家庭短期出行投保录入单')).toBeVisible();
  await expect(sandbox.getByText('监护人姓名')).toBeVisible();
  const browserTraffic: string[] = [];
  page.on('request', (request) => browserTraffic.push(request.url()));
  await sandbox.getByRole('button', { name: '保存草稿', exact: true }).click();
  await expect(sandbox.getByText('模拟保存草稿完成。')).toBeVisible();
  await sandbox.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(sandbox.getByText(/模拟提交(校验通过|未通过校验)/)).toBeVisible();
  await expect(browserTraffic).toEqual([]);
  const search = sandbox.getByPlaceholder('输入城市关键词');
  await search.fill('杭州');
  await sandbox.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(sandbox.getByRole('button', { name: '杭州市（模拟）' })).toBeVisible();
  await expect(browserTraffic).toEqual([]);

  const applicant = sandbox.locator('input').first();
  await expect(applicant).toHaveValue('投保人示例');
  await applicant.fill('临时试填');

  // Keep just the simulated Host completions pending while real engine/UI work proceeds.
  const work = await page.evaluateHandle(() => {
    const timers: Pick<Window, 'setTimeout' | 'clearTimeout'> = window;
    const start = timers.setTimeout.bind(window);
    const stop = timers.clearTimeout.bind(window);
    const callbacks: (() => void)[] = [];
    const canceled = new Set<number>();
    timers.setTimeout = (callback, delay, ...args) => {
      if (delay !== 180 || typeof callback !== 'function') return start(callback, delay, ...args);
      callbacks.push(() => callback(...args));
      return -callbacks.length;
    };
    timers.clearTimeout = (id) => {
      if (id !== undefined && id < 0) canceled.add(id);
      else stop(id);
    };
    return {
      pending: () => callbacks.length,
      canceled: () => canceled.size,
      release() {
        timers.setTimeout = start;
        timers.clearTimeout = stop;
        callbacks.forEach((callback) => callback());
      },
    };
  });
  await sandbox.getByRole('textbox', { name: '证件号码' }).first().fill('TEST-CHANGED');
  await search.fill('未完成');
  await sandbox.getByRole('button', { name: '搜索', exact: true }).click();
  await expect(sandbox.getByText('搜索中')).toBeVisible();
  await sandbox.getByRole('button', { name: '提交申请', exact: true }).click();
  await expect(sandbox.getByText('正在模拟提交校验。')).toBeVisible();
  await expect
    .poll(() => work.evaluate((probe) => probe.pending() - probe.canceled()))
    .toBeGreaterThanOrEqual(2);
  await page.getByRole('button', { name: '关闭预览' }).click();
  await expect(sandbox).toHaveCount(0);
  await expect.poll(() => work.evaluate((probe) => probe.pending() - probe.canceled())).toBe(0);
  await work.evaluate((probe) => probe.release());
  await work.dispose();
  await expect(browserTraffic).toEqual([]);
  await preview.click();
  await expect(applicant).toHaveValue('投保人示例');
  await expect(sandbox.getByText(/未完成市|模拟提交/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '查看快照' })).toHaveCount(0);

  await page.getByRole('button', { name: '关闭预览' }).click();
  await schemaSource(page);
  await editor.fill(text.replace('travel.checkEligibility', 'travel.unknownProductionValidator'));
  await preview.click();
  await expect(
    page.getByText(/当前 Web 预览未配置.*travel.unknownProductionValidator/),
  ).toBeVisible();
  await expect(sandbox.getByText('家庭短期出行投保录入单')).toHaveCount(0);
});

test('a late metadata response cannot retarget a different open form', async ({ page }) => {
  await create(page, '修改中的表单');
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('另一张表单');
  await page.getByRole('button', { name: '创建表单' }).click();
  await expect(page.getByRole('heading', { name: '另一张表单' })).toBeVisible();
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('button', { name: '打开 修改中的表单' }).click();
  await page.getByRole('button', { name: '管理表单', exact: true }).click();
  await page.getByRole('menuitem', { name: '编辑名称与说明' }).click();
  await page.getByLabel('名称', { exact: true }).fill('更新后的名称');
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const routePath = '**/api/platform/forms/*/metadata';
  await page.route(
    routePath,
    async (route) => {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await held;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  const submitted = page.waitForRequest(routePath);
  await page.getByRole('button', { name: '保存表单信息' }).click();
  await submitted;
  await expect(page.getByRole('button', { name: '关闭', exact: true })).toBeDisabled();
  const late = page.waitForResponse(routePath);
  release();
  await late;
  await expect(page.getByRole('dialog', { name: '编辑名称与说明' })).toBeHidden();
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('button', { name: '打开 另一张表单' }).click();
  await expect(page.getByRole('heading', { name: '另一张表单' })).toBeVisible();
  await page.getByRole('button', { name: '新建草稿' }).click();
  await page.getByLabel('版本名称').fill('另一张表单草稿');
  await page.getByRole('button', { name: '创建并编辑' }).click();
  await page.getByRole('button', { name: 'JSON 原文', exact: true }).click();
  await save(page, '{"onlyOtherForm":true}');
  await expect(page.getByRole('heading', { name: '另一张表单草稿' })).toBeVisible();
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await expect(page.getByRole('heading', { name: '另一张表单' })).toBeVisible();
  await page.getByRole('button', { name: '返回表单列表' }).click();
  await page.getByRole('button', { name: '打开 更新后的名称' }).click();
  await expect(page.getByRole('heading', { name: '更新后的名称' })).toBeVisible();
  const formId = new URL(page.url()).searchParams.get('form');
  const versions = await page.request.get('/api/platform/forms/' + formId + '/versions');
  expect(versions.ok()).toBeTruthy();
  expect(await versions.json()).toEqual([]);
});

test('keeps a frozen copy receipt replayable when the unsaved source is archived', async ({
  page,
}) => {
  await create(page, '未保存的复制来源');
  const formId = new URL(page.url()).searchParams.get('form');
  const copies = `/api/platform/forms/${formId}/copies`;
  const origin = new URL(page.url()).origin;
  const data = { name: '冻结副本', text: '{"冻结原文":true}', basedOnVersionId: null };
  const headers = { 'Idempotency-Key': crypto.randomUUID(), Origin: origin };
  // The current UI copies saved snapshots. Exercise the historical raw-text request at its public API.
  const copied = await page.request.post(copies, { headers, data });
  expect(copied.status()).toBe(201);
  const receipt = await copied.json();
  await page.getByRole('button', { name: '管理表单', exact: true }).click();
  await page.getByRole('menuitem', { name: '归档表单', exact: true }).click();
  await page.getByRole('button', { name: '确认归档', exact: true }).click();
  const retry = await page.request.post(copies, { headers, data });
  expect(retry.status()).toBe(201);
  expect(await retry.json()).toEqual(receipt);
  const newCopy = await page.request.post(copies, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { ...data, name: '归档后不得创建' },
  });
  expect(newCopy.status()).toBe(409);
  await page.getByRole('button', { name: '返回表单列表' }).click();
  const copy = page.getByRole('button', { name: '打开 冻结副本', exact: true });
  await expect(copy).toHaveCount(1);
  await copy.click();
  await chooseWorkingVersionAction(page, '查看配置');
  await expect(await schemaSource(page)).toHaveValue('{\n    "冻结原文": true\n}\n');
});

test('compares draft and historical configuration without replacing the draft', async ({
  page,
}) => {
  await createRecoveryWork(page, '差异验收');
  await save(page, '{"amount":9007199254740993}');
  await save(page, '{"amount":9007199254740994}');
  const editor = await schemaSource(page);
  await editor.fill('{"amount":9007199254740995}');
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '查看改动' }).click();
  const dialog = page.getByRole('dialog', { name: '配置对比' });
  await dialog.getByText('修改　/amount', { exact: true }).click();
  await expect(dialog.getByText('9007199254740995', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '返回' }).click();
  await expect(editor).toHaveValue(/^\s*\{\s*"amount":\s*9007199254740995\s*\}\s*$/);
  await save(page);
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await chooseWorkingVersionAction(page, '保存历史');
  await page.getByRole('button', { name: '对比快照' }).click();
  await dialog.getByText('修改　/amount', { exact: true }).click();
  await expect(dialog.getByText('9007199254740994', { exact: true })).toBeVisible();
  await expect(dialog.getByText('9007199254740995', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: '返回' }).click();
  await page
    .getByRole('dialog', { name: '保存历史' })
    .getByRole('button', { name: '关闭' })
    .click();
  await chooseWorkingVersionAction(page, '编辑配置');
  await expect(await schemaSource(page)).toHaveValue(/"amount":\s*9007199254740995/);
});

test('compares a publish candidate with the previous successful release', async ({ page }) => {
  const name = '发布对比验收';
  await createRecoveryWork(page, name);
  const initial = JSON.stringify({
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
  });
  await save(page, initial);
  await page.getByRole('button', { name: '返回版本列表' }).click();
  let release = await chooseWorkingPublication(page, name + '草稿');
  await release.getByRole('button', { name: '与上次发布对比' }).click();
  const diff = page.getByRole('dialog', { name: '配置对比' });
  await expect(diff.getByText('首次发布，尚无上一次发布配置。')).toBeVisible();
  await diff.getByRole('button', { name: '返回' }).click();
  await release.getByRole('button', { name: '确认发布' }).click();
  await expect(workingVersionRow(page, name + '草稿').getByText(/已发布/)).toBeVisible();
  await chooseWorkingVersionAction(page, '基于此版创建新版');
  await page.getByLabel('版本名称', { exact: true }).fill('对比新版');
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
  await save(page, initial.replace('家庭短期出行投保录入单', '新版家庭出行'));
  await page.getByRole('button', { name: '返回版本列表' }).click();
  release = await chooseWorkingPublication(page, '对比新版');
  await release.getByRole('button', { name: '与上次发布对比' }).click();
  await expect(diff.getByText(/修改 1/)).toBeVisible();
});

async function createRecoveryWork(page: Page, name: string) {
  await create(page, name);
  await createWorkingVersion(page, name + '草稿');
}

test('refresh restores exact invalid text and metadata, tabs keep separate drafts and logout clears them', async ({
  page,
  context,
}) => {
  await createRecoveryWork(page, '恢复验收');
  const url = page.url();
  await schemaSource(page);
  await page.getByLabel('配置原文', { exact: true }).fill('{"unfinished":');
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '保存备注' }).click();
  await page.getByLabel('保存备注（选填）').fill('待补完');
  await page
    .getByRole('dialog', { name: '保存备注' })
    .getByRole('button', { name: '关闭' })
    .click();
  await expect(page.locator('.draft-recovery')).toHaveAttribute('data-protected', 'true');
  page.once('dialog', (d) => d.accept());
  await page.reload();
  const drafts = page.getByText('本机草稿（1）', { exact: true });
  await expect(drafts).toBeVisible();
  await expect(page.getByRole('button', { name: '恢复编辑' })).toBeHidden();
  await drafts.click();
  await page.getByRole('button', { name: '恢复编辑' }).click();
  await schemaSource(page);
  await expect(page.getByLabel('配置原文', { exact: true })).toHaveValue('{"unfinished":');
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '保存备注' }).click();
  await expect(page.getByLabel('保存备注（选填）')).toHaveValue('待补完');
  await page
    .getByRole('dialog', { name: '保存备注' })
    .getByRole('button', { name: '关闭' })
    .click();
  const second = await context.newPage();
  await second.goto(url);
  await schemaSource(second);
  await second.getByLabel('配置原文', { exact: true }).fill('{"other":true}');
  await expect(second.locator('.draft-recovery')).toHaveAttribute('data-protected', 'true');
  const inspect = await context.newPage();
  await inspect.goto(url);
  await inspect.getByText('本机草稿（2）', { exact: true }).click();
  const region = inspect.getByRole('region', { name: '本机草稿' });
  await expect(region.locator('.draft-row')).toHaveCount(2);
  await inspect.getByRole('button', { name: '返回版本列表' }).click();
  await inspect.getByRole('button', { name: '返回表单列表' }).click();
  await inspect.getByRole('button', { name: '我的账号' }).click();
  await inspect.getByRole('menuitem', { name: '退出登录' }).click();
  await expect(page.getByRole('button', { name: '使用账号密码登录' })).toBeVisible();
  await inspect.getByRole('button', { name: '使用账号密码登录' }).click();
  await inspect.getByLabel('用户名').fill('studio-test');
  await inspect.getByLabel('密码').fill('local-browser-test-password');
  await inspect.getByRole('button', { name: '登录', exact: true }).click();
  await inspect.getByRole('button', { name: '打开 恢复验收' }).click();
  await expect(inspect.getByRole('heading', { name: '恢复验收' })).toBeVisible();
  expect(
    await inspect.evaluate(async () => {
      const db = await new Promise<IDBDatabase>((ok) => {
        const r = indexedDB.open('studio-local-drafts');
        r.onsuccess = () => ok(r.result);
      });
      return new Promise<number>((ok) => {
        const r = db.transaction('drafts').objectStore('drafts').count();
        r.onsuccess = () => ok(r.result);
      });
    }),
  ).toBe(0);
});

test('narrow configuration comparison stacks both values and fits the viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await createRecoveryWork(page, '窄屏对比');
  await save(page, JSON.stringify({ long: 'x'.repeat(300) }));
  await schemaSource(page);
  await page
    .getByRole('textbox', { name: '配置原文', exact: true })
    .fill(JSON.stringify({ long: 'y'.repeat(300) }));
  await page.getByRole('button', { name: '更多操作' }).click();
  await page.getByRole('menuitem', { name: '查看改动' }).click();
  const dialog = page.getByRole('dialog', { name: '配置对比' });
  await dialog.getByText('修改　/long', { exact: true }).click();
  const pair = dialog.locator('details[open] .diff-pair').first();
  const [first, second] = await pair
    .locator(':scope > div')
    .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().toJSON()));
  expect(second.top).toBeGreaterThanOrEqual(first.bottom);
  expect(
    await dialog.evaluate(
      (e) => e.scrollWidth <= e.clientWidth && e.getBoundingClientRect().right <= innerWidth,
    ),
  ).toBe(true);
});

test('refresh after lost save response retries only the frozen request and keeps newer edits', async ({
  page,
}) => {
  await createRecoveryWork(page, '恢复待确认请求');
  await schemaSource(page);
  const keys: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().endsWith('/versions'))
      keys.push(r.headers()['idempotency-key']);
  });
  await page.route(
    '**/api/platform/forms/*/versions',
    async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }
      await route.fetch();
      await route.abort();
    },
    { times: 1 },
  );
  await page.getByLabel('配置原文', { exact: true }).fill('{"first":1}');
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await page.getByRole('button', { name: '重试本次保存' }).waitFor();
  await page.getByLabel('配置原文', { exact: true }).fill('{"later":2}');
  await expect(page.locator('.draft-recovery')).toHaveAttribute('data-protected', 'true');
  page.once('dialog', (d) => d.accept());
  await page.reload();
  const drafts = page.getByText('本机草稿（1）', { exact: true });
  await expect(drafts).toBeVisible();
  await expect(page.getByRole('button', { name: '恢复编辑' })).toBeHidden();
  await drafts.click();
  await page.getByRole('button', { name: '恢复编辑' }).click();
  const retry = page.getByRole('button', { name: '重试本次保存' });
  await expect(retry).toBeEnabled();
  expect(keys).toHaveLength(1);
  await retry.click();
  await expect(page.locator('.draft-recovery')).toHaveAttribute('data-protected', 'true');
  await schemaSource(page);
  await expect(page.getByLabel('配置原文', { exact: true })).toHaveValue(/"later":\s*2/);
  expect(keys).toEqual([keys[0], keys[0]]);
});

test('saving a copy from an active tab keeps the source recovery entry', async ({
  page,
  context,
}) => {
  await createRecoveryWork(page, '并行保护验收');
  await schemaSource(page);
  await page.getByLabel('配置原文', { exact: true }).fill('{"active":true}');
  await expect(page.locator('.draft-recovery')).toHaveAttribute('data-protected', 'true');
  const other = await context.newPage();
  await other.goto(page.url());
  await other.getByText('本机草稿（1）', { exact: true }).click();
  await other.getByRole('button', { name: '恢复编辑' }).click();
  await other.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(other.getByText('已保存', { exact: true })).toBeVisible();
  await other.reload();
  const entry = other.getByText('本机草稿（1）', { exact: true });
  const region = other.getByRole('region', { name: '本机草稿' });
  await expect(entry).toBeVisible();
  await expect(other.getByText('已保存', { exact: true })).toBeVisible();
  await expect(region).toBeHidden();
  await entry.click();
  await expect(region).toBeVisible();
  await entry.click();
  await expect(region).toBeHidden();
  await entry.click();
  await expect(region.locator('.draft-row')).toHaveCount(1);
  await region.getByRole('button', { name: '查看差异' }).click();
  await expect(other.getByRole('dialog', { name: '本机草稿差异' })).toBeVisible();
  await other.getByRole('button', { name: '关闭', exact: true }).click();
  await page.close();
  await region.getByRole('button', { name: '放弃此草稿' }).click();
  await expect(entry).toBeHidden();
  await expect(region).toHaveCount(0);
});

test('blocked local storage upgrade reports failure while server save succeeds', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    () =>
      new Promise<void>((ok, reject) => {
        const r = indexedDB.open('studio-local-drafts', 1);
        r.onupgradeneeded = () => {
          const s = r.result.createObjectStore('drafts', { keyPath: 'id' });
          s.createIndex('owner', ['userId', 'spaceId', 'formId']);
          s.createIndex('user', 'userId');
          r.result.createObjectStore('epochs');
        };
        r.onsuccess = () => {
          Object.assign(window, { heldDraftConnection: r.result });
          ok();
        };
        r.onerror = () => reject(r.error);
      }),
  );
  // Keep the old connection in a separate tab across login and form creation.
  const editor = await page.context().newPage();
  await createRecoveryWork(editor, '本机保护不可用验收');
  await expect(editor.getByText('本机保护不可用', { exact: true })).toBeVisible();
  await (await schemaSource(editor)).fill('{"server":true}');
  await editor.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(editor.getByText('已保存', { exact: true })).toBeVisible();
});

test('catalog material and function insertion previews, validates, checks and undoes each draft operation', async ({
  page,
}) => {
  const base = {
    ...travelDefinition,
    views: { desktop: { material: 'section', props: { title: '行程' }, slots: { default: [] } } },
  };
  const original = JSON.stringify(base, null, 4) + '\n';
  await openSchemaDraft(page, original);
  await schemaSource(page);
  const writes: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/(versions|releases)$/.test(r.url())) writes.push(r.url());
  });
  async function select(label: string, value: string) {
    await page.getByRole('combobox', { name: label, exact: true }).click();
    await page.getByRole('option', { name: value, exact: true }).click();
  }
  async function selectField(label: string, path: string) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const picker = page.getByRole('dialog', { name: label, exact: true });
    await picker.getByRole('searchbox').fill(path);
    await picker.getByText(path, { exact: true }).click();
    await picker.getByRole('button', { name: '应用选择', exact: true }).click();
  }
  async function apply() {
    await page.getByRole('button', { name: '预览改动' }).click();
    const checked = page.waitForResponse(
      (r) => r.url().endsWith('/check') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: '插入草稿' }).click();
    const response = await checked;
    expect(response.ok()).toBeTruthy();
    expect((await response.json()).success).toBe(true);
    await page.getByRole('button', { name: '关闭检查', exact: true }).click();
    return JSON.parse(response.request().postDataJSON().text);
  }
  async function undo() {
    await page.getByRole('button', { name: '撤销', exact: true }).click();
    await expect(await schemaSource(page)).toHaveValue(original);
  }
  await page.getByRole('button', { name: '添加物料' }).click();
  await page.getByLabel('搜索目录').fill('remote-select');
  await page.getByRole('button', { name: '查看 remote-select' }).click();
  await select('目标位置', '追加到插槽 · desktop / default');
  await expect(page.getByRole('button', { name: '预览改动' })).toBeDisabled();
  await selectField('绑定 value（必填）', '/travel/city');
  await expect(page.getByRole('button', { name: '预览改动' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Host 请求 search（必填）' }).fill('travel.searchCities');
  await selectField('filterKey 来源字段', '/travel/countryCode');
  const inserted = await apply();
  expect(inserted.views.desktop.slots.default).toEqual([
    {
      material: 'remote-select',
      props: { filterKey: { $expr: { ref: { source: 'data', path: '/travel/countryCode' } } } },
      bindings: { value: { source: 'data', path: '/travel/city' } },
      requests: { search: { type: 'host.request', request: 'travel.searchCities' } },
    },
  ]);
  await undo();
  await page.getByRole('button', { name: '插入函数' }).click();
  await page.getByLabel('搜索目录').fill('date.inclusiveDays');
  await page.getByRole('button', { name: /date\.inclusiveDays/ }).click();
  await select('目标位置', '替换表达式 · tripDays');
  await selectField('end 字段', '/travel/endDate');
  await expect(page.getByRole('button', { name: '预览改动' })).toBeDisabled();
  await selectField('start 字段', '/travel/startDate');
  const replaced = await apply();
  expect(replaced.expressions.tripDays).toEqual({
    op: 'date.inclusiveDays',
    args: [
      { ref: { source: 'data', path: '/travel/startDate' } },
      { ref: { source: 'data', path: '/travel/endDate' } },
    ],
  });
  await undo();
  expect(writes).toEqual([]);
});

test('narrow catalog supports cancelling and adding a named expression to a draft', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base =
    '{"views":{"desktop":{"material":"section"}},"data":{"schema":{"type":"object","properties":{"name":{"type":"string"}}}}}';
  await openSchemaDraft(page, base);
  const editor = await schemaSource(page);
  await page.getByRole('button', { name: '插入函数' }).click();
  const dialog = page.getByRole('dialog', { name: '插入函数' });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.evaluate((node) => ({
    scrollWidth: node.scrollWidth,
    clientWidth: node.clientWidth,
    right: node.getBoundingClientRect().right,
    viewport: innerWidth,
    overflowing: [...node.querySelectorAll<HTMLElement>('*')]
      .filter((child) => child.getBoundingClientRect().right > node.getBoundingClientRect().right)
      .map((child) => child.className || child.tagName),
  }));
  expect(bounds.scrollWidth, JSON.stringify(bounds)).toBeLessThanOrEqual(bounds.clientWidth);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(editor).toHaveValue(base);
  await page.getByRole('button', { name: '插入函数' }).click();
  await dialog.getByLabel('搜索目录').fill('text.isNonBlank');
  await dialog.getByRole('button', { name: /text\.isNonBlank/ }).click();
  await dialog.getByRole('combobox', { name: '目标位置' }).click();
  await page.getByRole('option', { name: '新增具名表达式' }).click();
  await dialog.getByLabel('表达式名称').fill('hasName');
  await dialog.getByRole('button', { name: / 字段$/ }).click();
  const picker = page.getByRole('dialog', { name: / 字段$/ });
  await expect(picker.getByRole('searchbox')).toBeVisible();
  expect(await picker.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  await picker.getByText('/name', { exact: true }).click();
  await picker.getByRole('button', { name: '应用选择', exact: true }).click();
  await dialog.getByRole('button', { name: '预览改动' }).click();
  await dialog.getByRole('button', { name: '插入草稿' }).click();
  await expect(page.getByText(/配置检查未通过/)).toBeVisible();
  await page.getByRole('button', { name: '关闭检查', exact: true }).click();
  await schemaSource(page);
  expect(JSON.parse(await editor.inputValue()).expressions.hasName).toEqual({
    op: 'text.isNonBlank',
    args: [{ ref: { source: 'data', path: '/name' } }],
  });
  await editor.fill('{"x":1,"x":2}');
  await page.getByRole('button', { name: '添加物料' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '配置无法可靠解析' })).toBeVisible();
});

test('preview opens a fresh form and preserves the configuration', async ({ page }) => {
  await openPreviewDraft(page, '基础信息试填', basicInformationDefinition);
  const editor = await schemaSource(page);
  const original = await editor.inputValue();
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: '预览配置' }).click();
    const preview = page.getByRole('region', { name: '受控预览' });
    await expect(preview.getByRole('combobox', { name: '测试场景' })).toHaveCount(0);
    const name = preview.getByPlaceholder('请输入姓名');
    await expect(name).toHaveValue('');
    await name.fill('临时试填');
    await page.getByRole('button', { name: '关闭预览' }).click();
    await expect(editor).toHaveValue(original);
  }
});

test('narrow Studio journey keeps an edited draft consistent through preview, Host and operation history', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openPreviewDraft(page, '基础信息端到端走查', basicInformationDefinition);
  const fits = async (p: Page) =>
    expect(
      await p.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          [...document.querySelectorAll('dialog[open]')].every(
            (el) => el.scrollWidth <= el.clientWidth + 1,
          ),
      ),
    ).toBe(true);
  const editor = await schemaSource(page);
  await editor.fill((await editor.inputValue()).replace('请输入姓名', '请填写联系人姓名'));
  await fits(page);
  await page.getByRole('button', { name: '预览配置' }).click();
  const dialog = page.getByRole('region', { name: '受控预览' });
  await dialog.getByPlaceholder('请填写联系人姓名').fill('林小满');
  await expect(dialog.getByPlaceholder('请填写联系人姓名')).toHaveValue('林小满');
  await fits(page);
  await page.getByRole('button', { name: '关闭预览' }).click();
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  await expect(page.getByText('已保存', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await chooseWorkingVersionAction(page, '发布');
  await page.getByLabel('发布名称', { exact: true }).fill('基础信息正式版');
  await fits(page);
  await page.getByRole('button', { name: '确认发布' }).click();
  await chooseWorkingVersionAction(page, '查看本次发布');
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: '在示例 Host 中打开' }).click();
  const host = await popup;
  await expect(host.getByPlaceholder('请填写联系人姓名')).toHaveValue('');
  await host.getByPlaceholder('请填写联系人姓名').fill('正式试填');
  await fits(host);
  const releaseId = new URL(host.url()).searchParams.get('releaseId')!;
  await host.close();
  await page.getByRole('button', { name: '返回版本列表', exact: true }).click();
  await page.getByRole('button', { name: '操作记录', exact: true }).click();
  const log = page.getByRole('dialog', { name: '表单操作记录' });
  await log.getByRole('button', { name: /发布表单.*基础信息正式版/ }).click();
  await fits(page);
  await expect(log.getByText(releaseId, { exact: true })).toBeVisible();
  await log.getByRole('button', { name: '打开发布详情' }).click();
  await expect(page).toHaveURL(new RegExp('release=' + releaseId));
});
