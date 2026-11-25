import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { travelDefinition } from '../../playground/src/demos/travel/definition';
import { chooseWorkingVersionAction } from './working-version-menu';
import {
  chooseWorkingPublication,
  createWorkingVersion,
  saveWorkingConfig,
  workingVersionRow,
} from './working-version-fixture';

test('publishes two versions and opens the exact releases in an unauthenticated Host', async ({
  page,
  browser,
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
  await page.getByLabel('密码').fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('在线发布差旅');
  await page.getByRole('button', { name: '创建表单' }).click();
  await createWorkingVersion(page, '差旅首版');
  const formId = new URL(page.url()).searchParams.get('form');
  const origin = new URL(page.url()).origin;
  const raw = JSON.stringify({
    ...travelDefinition,
    views: { desktop: travelDefinition.views.desktop },
  });
  const firstVersion = await saveWorkingConfig(page, raw);
  await page.getByRole('button', { name: '返回版本列表' }).click();
  const publishRequests: { versionId: string; key: string }[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/releases'))
      publishRequests.push({
        versionId: request.postDataJSON().versionId,
        key: request.headers()['idempotency-key'],
      });
  });
  const firstPublish = await chooseWorkingPublication(page, '差旅首版');
  await firstPublish.getByRole('button', { name: '确认发布' }).click();
  const firstRow = workingVersionRow(page, '差旅首版');
  await expect(firstRow.getByText(/已发布/)).toBeVisible();
  await chooseWorkingVersionAction(page, '查看本次发布', firstRow);
  const hostLink = page.getByRole('link', { name: '在示例 Host 中打开' });
  await expect(hostLink).toBeVisible();
  const first = await hostLink.getAttribute('href');
  expect(publishRequests.map((r) => r.versionId)).toEqual([firstVersion]);
  await page.getByRole('button', { name: '返回版本列表', exact: true }).click();
  await chooseWorkingVersionAction(page, '基于此版创建新版', firstRow);
  await page.getByLabel('版本名称', { exact: true }).fill('差旅第二版');
  await page.getByRole('button', { name: '创建并编辑', exact: true }).click();
  const next = raw.replace('家庭短期出行投保录入单', '新版家庭出行');
  const secondVersion = await saveWorkingConfig(page, next);
  await page.getByRole('button', { name: '返回版本列表' }).click();
  await page.route(
    '**/api/platform/forms/*/releases',
    async (route) => {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort();
    },
    { times: 1 },
  );
  const secondPublish = await chooseWorkingPublication(page, '差旅第二版');
  const confirm = secondPublish.getByRole('button', { name: '确认发布' });
  await confirm.click();
  await expect(secondPublish.getByRole('alert')).toBeVisible();
  await expect(confirm).toBeEnabled();
  const archived = await page.request.post(`/api/platform/forms/${formId}/archive`, {
    headers: { Origin: origin },
  });
  expect(archived.ok()).toBeTruthy();
  await confirm.click();
  const secondRow = workingVersionRow(page, '差旅第二版');
  await expect(secondRow.getByText(/已发布/)).toBeVisible();
  expect(publishRequests.map((r) => r.versionId)).toEqual([
    firstVersion,
    secondVersion,
    secondVersion,
  ]);
  expect(publishRequests[2].key).toBe(publishRequests[1].key);
  await chooseWorkingVersionAction(page, '查看本次发布', secondRow);
  await expect(hostLink).toBeVisible();
  const second = await hostLink.getAttribute('href');
  expect(second).not.toBe(first);
  await page.getByRole('tab', { name: '所需宿主能力', exact: true }).click();
  await page.getByRole('button', { name: '查看契约 travel.searchCities', exact: true }).click();
  await expect(
    page.getByText('搜索框输入的关键词，如“杭州”。物料内部维护，无需配置绑定。'),
  ).toBeVisible();
  await expect(page.getByText(/type Result =/)).toContainText('items');
  const hostContext = await browser.newContext();
  try {
    const host = await hostContext.newPage();
    await host.goto(new URL(first!, page.url()).href);
    const input = host.getByLabel('发布 ID');
    const loader = host.getByRole('region', { name: '装载发布' });
    const load = loader.getByRole('button', { name: '新建独立实例' });
    const instances = host.getByRole('region', { name: '已装载实例' });
    const firstId = new URL(first!, page.url()).searchParams.get('releaseId')!;
    const secondId = new URL(second!, page.url()).searchParams.get('releaseId')!;
    const firstDelivery = '**/api/platform/releases/' + firstId;
    const secondDelivery = '**/api/platform/releases/' + secondId;
    await expect(instances).toHaveCount(1);
    const original = instances.first();
    await expect(original.getByText('家庭短期出行投保录入单')).toBeVisible();
    await expect(original.getByText('监护人姓名')).toBeVisible();
    const diagnostics = host.getByRole('dialog', { name: 'Host 装载诊断' });
    async function checkStages(states: string[]) {
      const traffic: string[] = [];
      const listener = (r: import('@playwright/test').Request) => traffic.push(r.url());
      host.on('request', listener);
      try {
        await loader.getByRole('button', { name: '查看诊断' }).click();
        await expect(diagnostics.locator('.host-stages strong')).toHaveText(states);
        if (states.every((s) => s === '通过')) {
          await diagnostics.getByText(/请求 · travel.searchCities/).click();
          await expect(diagnostics.getByText(/示例 Host 调用/)).toContainText('请求 0 · 动作 0');
        }
        await diagnostics.getByRole('button', { name: '关闭', exact: true }).click();
      } finally {
        host.off('request', listener);
      }
      expect(traffic.filter((url) => url.includes('/api/'))).toEqual([]);
    }
    await checkStages(['通过', '通过', '通过', '通过', '通过']);
    await checkStages(['通过', '通过', '通过', '通过', '通过']);
    const applicant = original.locator('input').first();
    await applicant.fill('Host 独立填写');
    await original.getByRole('button', { name: '保存草稿', exact: true }).click();
    await expect(original.getByText('已保存在当前 Host 实例。')).toBeVisible();
    await applicant.fill('修改后还原');
    await original.getByRole('button', { name: '恢复草稿', exact: true }).click();
    await expect(applicant).toHaveValue('Host 独立填写');
    await original.getByPlaceholder('输入城市关键词').fill('上海');
    await original.getByRole('button', { name: '搜索', exact: true }).click();
    await expect(original.getByRole('button', { name: '上海', exact: true })).toBeVisible();
    await loader.getByRole('button', { name: '查看诊断' }).click();
    await expect(diagnostics.getByText(/示例 Host 调用/)).toContainText('请求 1 · 动作 1');
    await diagnostics.getByRole('button', { name: '刷新运行记录' }).click();
    await expect(diagnostics.getByText(/示例 Host 调用/)).toContainText('请求 1 · 动作 1');
    await diagnostics.getByRole('button', { name: '关闭', exact: true }).click();
    const document = original.getByRole('textbox', { name: '证件号码' }).first();
    await document.fill('TEST-BLOCKED');
    await original.getByRole('button', { name: '提交申请', exact: true }).click();
    await expect(original.getByText('当前填写结果未通过校验。')).toBeVisible();
    await expect(
      original
        .getByRole('list', { name: '成员问题' })
        .getByText('示例 Host 的本地资格校验未通过。'),
    ).toBeVisible();
    await document.fill('TEST-A');

    let finishOld!: () => void;
    const delayed = new Promise<void>((resolve) => {
      finishOld = resolve;
    });
    await host.route(
      firstDelivery,
      async (route) => {
        const response = await route.fetch();
        await delayed;
        await route.fulfill({ response }).catch(() => undefined);
      },
      { times: 1 },
    );
    const started = host.waitForRequest(firstDelivery);
    await load.click();
    await started;
    await input.fill(secondId);
    await load.click();
    await expect(instances).toHaveCount(2);
    finishOld();
    await expect(instances.last().getByText('新版家庭出行')).toBeVisible();
    await expect(applicant).toHaveValue('Host 独立填写');

    await host.route(
      secondDelivery,
      async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        json.preparedText += ' ';
        await route.fulfill({ response, json });
      },
      { times: 1 },
    );
    await load.click();
    await expect(loader.getByRole('alert')).toHaveText('发布制品摘要不匹配。');
    await checkStages(['通过', '失败', '未检查', '未检查', '未检查']);
    await expect(instances).toHaveCount(2);

    await host.route(
      secondDelivery,
      async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        const prepared = JSON.parse(json.preparedText);
        const materials = Object.values(prepared.capabilityLock.materials) as {
          artifact: { digest: string };
        }[];
        materials[0].artifact.digest = 'sha256:' + 'a'.repeat(64);
        json.preparedText = JSON.stringify(prepared);
        json.digest = 'sha256:' + createHash('sha256').update(json.preparedText).digest('hex');
        await route.fulfill({ response, json });
      },
      { times: 1 },
    );
    await load.click();
    await expect(loader.getByRole('alert')).toHaveText(/缺少兼容的物料/);
    await expect(instances).toHaveCount(2);

    for (const failure of [
      'identity',
      'structure',
      'format',
      'host',
      'manifest',
      'version',
    ] as const) {
      await host.route(
        secondDelivery,
        async (route) => {
          const response = await route.fetch();
          const json = await response.json();
          const prepared = JSON.parse(json.preparedText);
          if (failure === 'identity') json.releaseId = firstId;
          if (failure === 'structure') delete prepared.resources;
          if (failure === 'format') prepared.preparedFormatVersion = 'form-engine.prepared/999';
          if (failure === 'host') prepared.hostRequirements.validators[0].name = 'missing';
          if (failure === 'version')
            prepared.capabilityLock.pureFunctions['date.inclusiveDays'].version = '9.9.9';
          if (failure === 'manifest') {
            const [material] = Object.values(prepared.capabilityLock.materials) as {
              manifestDigest: string;
            }[];
            material.manifestDigest = 'sha256:' + 'b'.repeat(64);
          }
          json.preparedText = JSON.stringify(prepared);
          json.digest = 'sha256:' + createHash('sha256').update(json.preparedText).digest('hex');
          await route.fulfill({ response, json });
        },
        { times: 1 },
      );
      await load.click();
      await expect(loader.getByRole('alert')).toHaveText(
        {
          identity: /发布身份/,
          structure: /制品结构无效/,
          format: /格式或目标不受支持/,
          host: /缺少必要能力/,
          manifest: /缺少兼容的物料/,
          version: /需要版本 9.9.9/,
        }[failure],
      );
      if (failure === 'host') await checkStages(['通过', '通过', '通过', '失败', '未检查']);
      if (failure === 'version') await checkStages(['通过', '通过', '失败', '未检查', '未检查']);
      await expect(instances).toHaveCount(2);
    }

    await input.fill('missing');
    await load.click();
    await expect(loader.getByRole('alert')).toHaveText('找不到该发布。');
    await expect(instances).toHaveCount(2);
  } finally {
    await hostContext.close();
  }
});
