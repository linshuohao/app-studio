import { expect, test } from '@playwright/test';
import { ref, travelDefinition } from '../../playground/src/demos/travel/definition';
import { chooseWorkingVersionAction } from './working-version-menu';
import {
  chooseWorkingPublication,
  createWorkingVersion,
  saveWorkingConfig,
  workingVersionRow,
} from './working-version-fixture';

test('queues a real form error offline and opens its original evidence after reconnecting', async ({
  page,
  context,
}) => {
  test.skip(
    process.env.PLATFORM_DIAGNOSTICS_STUDIO_PILOT !== '1',
    'Requires opt-in diagnostics pilot',
  );
  await page.goto('/');
  const passwordLogin = page.getByRole('button', { name: '使用账号密码登录', exact: true });
  await expect(page.getByLabel('用户名', { exact: true }).or(passwordLogin)).toBeVisible();
  if (await passwordLogin.isVisible()) await passwordLogin.click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码').fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '新建表单' }).click();
  await page.getByLabel('表单名称').fill('联动错误现场试点');
  await page.getByRole('button', { name: '创建表单' }).click();
  const workName = '联动错误试点';
  await createWorkingVersion(page, workName);
  const failureValue = '触发本次联动错误';
  const schema = travelDefinition.data.schema;
  if (typeof schema === 'boolean') throw new Error('Expected an object data schema');
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties))
    throw new Error('Expected data schema properties');
  await saveWorkingConfig(
    page,
    JSON.stringify({
      ...travelDefinition,
      data: {
        schema: {
          ...schema,
          properties: {
            ...properties,
            diagnosticDivisor: { type: 'number', default: 0 },
          },
        },
      },
      views: { desktop: travelDefinition.views.desktop },
      reactions: [
        ...travelDefinition.reactions!,
        {
          id: 'diagnostic-fixture',
          watch: [ref('/applicant/name')],
          when: {
            op: 'core.and',
            args: [
              { op: 'core.eq', args: [{ ref: ref('/applicant/name') }, { literal: failureValue }] },
              {
                op: 'core.and',
                args: [
                  {
                    op: 'core.gt',
                    args: [
                      {
                        op: 'core.div',
                        args: [{ literal: 1 }, { ref: ref('/diagnosticDivisor') }],
                      },
                      { literal: 0 },
                    ],
                  },
                  { op: 'core.ne', args: [{ ref: ref('/diagnosticDivisor') }, { literal: 0 }] },
                ],
              },
            ],
          },
          then: [{ op: 'set', target: ref('/estimatedTotalMinor'), value: 0 }],
        },
      ],
    }),
  );
  await page.getByRole('button', { name: '返回版本列表' }).click();
  const publish = await chooseWorkingPublication(page, workName);
  await publish.getByRole('button', { name: '确认发布' }).click();
  const row = workingVersionRow(page, workName);
  await expect(row.getByText(/已发布/)).toBeVisible();
  await chooseWorkingVersionAction(page, '查看本次发布', row);
  const href = await page.getByRole('link', { name: '在示例 Host 中打开' }).getAttribute('href');
  expect(href).toBeTruthy();
  await page.goto(href!);
  const input = page.getByRole('region', { name: '已装载实例' }).locator('input').first();
  await expect(input).toBeVisible();
  await context.setOffline(true);
  try {
    await input.fill(failureValue);
    await expect(input).toHaveValue(failureValue);
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve) => {
              const request = indexedDB.open('studio-form-diagnostics', 1);
              request.onupgradeneeded = () =>
                request.result.createObjectStore('events', { keyPath: 'id' });
              request.onerror = () => resolve(-1);
              request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('events').objectStore('events').count();
                count.onsuccess = () => {
                  resolve(count.result);
                  db.close();
                };
                count.onerror = () => {
                  resolve(-1);
                  db.close();
                };
              };
            }),
        ),
      )
      .toBeGreaterThan(0);
    const expiredId = await page.evaluate(() => {
      return new Promise<string>((resolve, reject) => {
        const request = indexedDB.open('studio-form-diagnostics', 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const transaction = db.transaction('events', 'readwrite');
          const store = transaction.objectStore('events');
          const read = store.getAll();
          const id = crypto.randomUUID();
          transaction.oncomplete = () => {
            db.close();
            resolve(id);
          };
          transaction.onerror = () => {
            db.close();
            reject(transaction.error);
          };
          read.onsuccess = () => {
            const queued = read.result.find(
              (row) => JSON.parse(row.body).targetId === 'diagnostic-fixture',
            );
            if (!queued) {
              transaction.abort();
              reject(new Error('Expected a queued diagnostic'));
              return;
            }
            const packet = JSON.parse(queued.body);
            // Exercise restoration of the target kind on a packet written by the earlier pilot.
            delete packet.targetKind;
            store.put({ ...queued, body: JSON.stringify(packet) });
            store.put({
              ...queued,
              id,
              expires: Date.now() + 60_000,
              body: JSON.stringify({ ...packet, eventId: id }),
            });
          };
        };
      });
    });
    const posted: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/diagnostics/pilot/events'))
        posted.push(request.postDataJSON().eventId);
    });
    // Pause after scanning the queue, then advance time while checking the uploading session.
    let lookedUpSession = false;
    await page.route(
      '**/api/platform/diagnostics/pilot',
      async (route) => {
        lookedUpSession = true;
        await page.clock.setFixedTime(new Date(Date.now() + 120_000));
        await route.continue();
      },
      { times: 1 },
    );
    const delivery = page.waitForResponse(
      (response) =>
        response.url().endsWith('/diagnostics/pilot/events') && response.status() === 201,
    );
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    const receipt = await delivery;
    expect(receipt.request().postDataJSON()).toMatchObject({
      targetKind: 'reaction',
      targetId: 'diagnostic-fixture',
    });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            new Promise<number>((resolve, reject) => {
              const request = indexedDB.open('studio-form-diagnostics', 1);
              request.onerror = () => reject(request.error);
              request.onsuccess = () => {
                const db = request.result;
                const count = db.transaction('events').objectStore('events').count();
                count.onsuccess = () => {
                  db.close();
                  resolve(count.result);
                };
                count.onerror = () => {
                  db.close();
                  reject(count.error);
                };
              };
            }),
        ),
      )
      .toBe(0);
    expect(lookedUpSession).toBe(true);
    expect(posted).not.toContain(expiredId);
  } finally {
    await context.setOffline(false);
  }
  await page.goto('/diagnostics');
  const diagnosticRow = page.getByRole('button', { name: /reaction.error.*diagnostic-fixture/ });
  await diagnosticRow.click();
  const occurrences = page.getByRole('dialog', { name: '发生记录' });
  await expect(occurrences).toHaveCount(0);
  await page.getByRole('button', { name: /发生记录/ }).click();
  await expect(occurrences.getByText('当前查看', { exact: true })).toBeVisible();
  await expect(occurrences.getByRole('button', { name: '切换到此记录' })).toHaveCount(0);
  await occurrences.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(occurrences).toHaveCount(0);
  const rawButton = page.getByRole('button', { name: '查看原始现场' });
  const detail = page.getByRole('dialog', { name: '原始现场' });
  await expect(detail).toHaveCount(0);
  await rawButton.click();
  const raw = detail.getByRole('region', { name: '现场 JSON' });
  await expect(raw.locator('.json-key').filter({ hasText: '"error":' })).toBeVisible();
  await expect(raw.locator('.json-string').first()).toBeVisible();
  await detail.getByRole('button', { name: '全部展开', exact: true }).click();
  await expect(raw.getByText(failureValue, { exact: false }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(rawButton).toBeFocused();
  await expect(page.getByRole('heading', { name: '错误详情' })).toBeVisible();
  await expect(
    page.getByRole('region', { name: '执行链路' }).getByRole('heading', { name: /data.change/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: '查看表单快照' }).click();
  const snapshot = page.getByRole('region', { name: '表单快照预览' });
  await expect(snapshot.locator('[data-diagnostic-snapshot-canvas]')).toHaveAttribute('inert', '');
  await expect(snapshot.getByPlaceholder('输入城市关键词')).toBeVisible();
  await snapshot.getByText('查看原始字段值', { exact: true }).click();
  await expect(snapshot.locator('.studio-code-block')).toContainText(failureValue);
  const config = page.getByRole('region', { name: '原发布配置' });
  await expect(config.locator('.studio-code-block')).toContainText('diagnostic-fixture');
  await page.getByRole('button', { name: '返回错误列表', exact: true }).click();
  await expect(diagnosticRow).toBeFocused();
  await diagnosticRow.click();
  const reference = page.getByRole('link', { name: '引用到 Agent', exact: true });
  await expect(reference).toHaveAttribute('href', /diagnostic=/);
  await reference.click();
  const referenceList = page.getByRole('list', { name: '待发送的引用' });
  await expect(referenceList.getByRole('link', { name: /^错误.*reaction.error/ })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '发送消息', exact: true })).toBeFocused();
});
