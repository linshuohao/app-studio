import { expect, test } from '@playwright/test';

test('keeps the draft, Host guide, and copyable JSX in the saved candidate reply', async ({
  page,
  context,
  baseURL,
}) => {
  const login = await page.request.post('/api/platform/login', {
    headers: { Origin: baseURL! },
    data: { username: 'studio-test', password: 'local-browser-test-password' },
  });
  expect(login.ok()).toBeTruthy();
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const id = crypto.randomUUID(),
    turnId = crypto.randomUUID(),
    draftId = crypto.randomUUID();
  const conversation = {
    id,
    title: '家庭旅险',
    revision: 1,
    turns: [
      {
        turnId,
        message: '生成旅险投保表单',
        draftId,
        result: {
          kind: 'proposal',
          summary: '候选已通过编译。',
          candidateGuide: {
            title: '家庭旅险投保候选',
            candidateDigest: 'fixture-digest',
            exampleCode: 'submitForUnderwriting(snapshot): Promise<Receipt>',
            hostRequirements: {
              events: [{ name: 'travel.previewUnderwritingSubmit', optional: false }],
            },
            hostPending: [
              {
                title: '渠道初核请求',
                details: ['本地通过后发起渠道初核。'],
                requirementIds: ['R38'],
              },
            ],
            previewPending: [
              { title: '成员删除', details: ['确认剩余成员的错误归属。'], requirementIds: ['R26'] },
            ],
          },
        },
      },
    ],
  };
  const delivery = `**/agent-conversations/${id}/deliveries/${turnId}`;
  const draft = {
    id: draftId,
    name: '家庭旅险',
    versionName: '初稿',
    text: '{}',
    candidateText: '{}',
    candidateDigest: 'fixture-digest',
    appliedDigest: 'fixture-digest',
    revision: 1,
  };
  await page.route(`**/agent-conversations/${id}`, (route) =>
    route.fulfill({ json: conversation }),
  );
  await page.route(delivery, (route) => route.fulfill({ json: { draft } }));
  await page.route(`**/form-drafts/${draftId}`, (route) => route.fulfill({ json: draft }));
  let draftHolder: 'agent' | null = 'agent';
  await page.route(`**/form-drafts/${draftId}/editing?*`, (route) =>
    route.fulfill({ json: { holder: draftHolder, own: false } }),
  );
  const prepared = {
    definition: { data: { schema: { type: 'object' } } },
    capabilityLock: { materials: {}, pureFunctions: {} },
    hostRequirements: {
      events: [{ name: 'travel.previewUnderwritingSubmit', optional: false }],
      validators: [],
      requests: [],
    },
  };
  let requested = 0;
  let regenerate = false;
  await page.route(`${delivery}/integration`, (route) => {
    requested++;
    return route.fulfill({
      json: { candidateDigest: 'fixture-digest', prepared, regenerated: regenerate },
    });
  });
  await page.route(`**/form-drafts/${draftId}/preview`, (route) => {
    expect(route.request().postDataJSON()).toMatchObject({
      revision: draft.revision,
      digest: draft.candidateDigest,
      workingText: draft.text,
    });
    return route.fulfill({ json: { digest: 'working-digest', prepared } });
  });
  await page.goto(`/?page=agent&conversation=${id}`);
  const chatHeader = page.locator('.agent-workspace > header');
  const editingStatus = page.getByText('Agent 正在修改此草稿。', { exact: true });
  await expect(editingStatus).toHaveCount(0);
  await expect(chatHeader.getByText('对话', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('log', { name: '对话记录' })).toBeVisible();
  const card = page.getByRole('region', { name: '候选配置', exact: true });
  await expect(card.getByRole('link', { name: '前往草稿' })).toHaveAttribute(
    'href',
    new RegExp(`draft=${draftId}`),
  );
  await expect(card.getByRole('table')).toHaveCount(0);
  await card
    .locator('summary')
    .filter({ hasText: /^接入说明$/ })
    .click();
  await expect(card.getByRole('table')).toContainText('travel.previewUnderwritingSubmit');
  expect(requested).toBe(0);
  await expect(card.getByText('渠道初核请求', { exact: true })).toBeHidden();
  await card
    .locator('summary')
    .filter({ hasText: /^待接入与待验证$/ })
    .click();
  await card.getByText('渠道初核请求', { exact: true }).click();
  await expect(card.getByText('需求 R38')).toBeVisible();
  await card.getByRole('button', { name: '查看 JSX' }).click();
  await expect(card.getByRole('button', { name: '下载 prepared.json' })).toBeVisible();
  const snippet = card.locator('pre[aria-label="JSX 接入示例"]');
  await expect(snippet).toContainText('<FormRenderer');
  await expect(snippet).toContainText('travel.previewUnderwritingSubmit');
  await expect(snippet).toContainText('//   submitForUnderwriting(snapshot): Promise<Receipt>');
  await expect(snippet.locator('[data-code-token="keyword"]').first()).toBeVisible();
  expect(
    await snippet.evaluate((element) => ({
      verticallyScrollable: element.scrollHeight > element.clientHeight,
      horizontallyScrollable: element.scrollWidth > element.clientWidth,
      maxHeight: getComputedStyle(element).maxHeight,
    })),
  ).toEqual({ verticallyScrollable: false, horizontallyScrollable: false, maxHeight: 'none' });
  await card.getByRole('button', { name: '复制 JSX' }).click();
  await expect(card.getByRole('status')).toHaveText('已复制完整 JSX。');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    await snippet.textContent(),
  );
  expect(requested).toBe(1);
  await page.reload();
  await expect(card.getByRole('link', { name: '前往草稿' })).toBeVisible();
  await expect(card.getByRole('table')).toHaveCount(0);
  await card.getByRole('link', { name: '前往草稿' }).click();
  await expect(page).toHaveURL(new RegExp(`page=draft&draft=${draftId}&conversation=${id}`));
  await expect(page.getByRole('heading', { name: '家庭旅险', exact: true })).toHaveText(draft.name);
  await expect(editingStatus).toBeVisible();
  draftHolder = null;
  await expect(editingStatus).toHaveCount(0);
  await expect(page.getByRole('button', { name: '编辑表单名称' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '对话', exact: true })).toHaveCount(0);
  const openGuide = page.getByRole('button', { name: '接入说明与 JSX' });
  await openGuide.click();
  const workGuide = page.getByRole('dialog', { name: '工作稿接入说明' });
  await expect(workGuide.getByText('当前工作稿编译通过')).toBeVisible();
  await expect(workGuide.getByRole('table')).toContainText('travel.previewUnderwritingSubmit');
  await workGuide.getByRole('button', { name: '查看 JSX' }).click();
  await expect(workGuide.locator('pre[aria-label="JSX 接入示例"]')).toContainText('<FormRenderer');
  await page.keyboard.press('Escape');
  await expect(openGuide).toBeFocused();
  await expect(page.getByRole('button', { name: '保存配置' })).toBeDisabled();
  expect(requested).toBe(1);
  await page.getByRole('button', { name: '打开完整 Agent 页面' }).click();
  await expect(page).toHaveURL(new RegExp(`page=agent&conversation=${id}`));
  await expect(card.getByRole('link', { name: '前往草稿' })).toBeVisible();
  regenerate = true;
  await card.getByRole('button', { name: '查看 JSX' }).click();
  await expect(card.getByText('已在当前编译环境重新检查原候选，并生成接入示例。')).toBeVisible();
  await expect(snippet).toContainText('<FormRenderer');
  await expect(snippet).not.toContainText('submitForUnderwriting(snapshot)');
  expect(context.pages()).toHaveLength(1);
});
