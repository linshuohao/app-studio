import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type {
  CompilerInputDefinition,
  Expression,
  ViewNode,
} from '@form-engine/protocol/definition';

const scenarios = [
  { key: 'freight', name: '运费分摊', divisor: '运输件数', scale: '制单重量' },
  { key: 'expense', name: '报销费用分摊', divisor: '分摊人数', scale: '预估报销金额' },
  { key: 'purchase', name: '采购单价核算', divisor: '采购数量', scale: '采购预算' },
  { key: 'staffing', name: '排班工时分配', divisor: '本班人数', scale: '申报工时' },
  { key: 'inventory', name: '入库装箱核算', divisor: '计划箱数', scale: '申报入库量' },
];
const ref = (path: string) => ({ source: 'data' as const, path });
const read = (path: string): Expression => ({ ref: ref(path) });
const literal = (value: number): Expression => ({ literal: value });
const call = (op: string, ...args: Expression[]): Expression => ({ op, args });

function field(label: string, path: string, material: 'text-input' | 'number-input'): ViewNode {
  const bindings = { value: ref(path) };
  return {
    material: 'field',
    props: { label },
    bindings,
    slots: { default: [{ material, bindings }] },
  };
}

function definition(scenario: (typeof scenarios)[number]): CompilerInputDefinition {
  return {
    protocolVersion: 'verification',
    id: 'diagnostics-' + scenario.key,
    version: 'draft',
    data: {
      schema: {
        type: 'object',
        required: ['record', 'divisor', 'scale', 'result'],
        properties: {
          record: { type: 'string', default: '' },
          divisor: { type: 'number', default: 1 },
          scale: { type: 'number', default: 1 },
          result: { type: 'number', default: 0 },
        },
      },
    },
    views: {
      main: {
        material: 'section',
        props: { title: scenario.name },
        slots: {
          default: [
            field('测试单据编号', '/record', 'text-input'),
            field(scenario.divisor, '/divisor', 'number-input'),
            field(scenario.scale, '/scale', 'number-input'),
          ],
        },
      },
    },
    reactions: [
      {
        id: 'zero-divisor',
        watch: [ref('/divisor')],
        when: call(
          'core.and',
          call('core.eq', read('/divisor'), literal(0)),
          call('core.gt', call('core.div', literal(100), read('/divisor')), literal(0)),
        ),
        then: [{ op: 'set', target: ref('/result'), value: 0 }],
      },
      {
        id: 'amount-overflow',
        watch: [ref('/scale')],
        when: call(
          'core.and',
          call('core.gt', read('/scale'), literal(9)),
          call('core.gt', call('core.mul', read('/scale'), literal(1e308)), literal(0)),
        ),
        then: [{ op: 'set', target: ref('/result'), value: 0 }],
      },
    ],
  };
}

test('builds 50 real error events attached to five published forms', async ({ page }, testInfo) => {
  test.skip(
    process.env.PLATFORM_DIAGNOSTICS_STUDIO_PILOT !== '1',
    'Requires opt-in diagnostics pilot',
  );
  test.setTimeout(120_000);
  await page.goto('/');
  const toggle = page.getByRole('button', { name: '使用账号密码登录', exact: true });
  await expect(page.getByLabel('用户名', { exact: true }).or(toggle)).toBeVisible();
  if (await toggle.isVisible()) await toggle.click();
  await page.getByLabel('用户名').fill('studio-test');
  await page.getByLabel('密码').fill('local-browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await expect(page.getByRole('button', { name: '新建表单' })).toBeVisible();
  const origin = new URL(page.url()).origin;

  async function post<T>(route: string, data: object): Promise<T> {
    const response = await page.request.post('/api/platform/' + route, {
      headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
      data,
    });
    expect(response.ok(), route + ' ' + (await response.text())).toBeTruthy();
    return response.json();
  }

  async function get<T>(route: string): Promise<T> {
    const response = await page.request.get('/api/platform/' + route);
    expect(response.ok(), route).toBeTruthy();
    return response.json();
  }

  const corpus = [];
  const allDiagnosticIds = new Set<string>();
  for (const scenario of scenarios) {
    const config = definition(scenario);
    const { formId } = await post<{ formId: string }>('forms', {
      name: scenario.name + ' · 诊断样本',
    });
    const { versionId } = await post<{ versionId: string }>('forms/' + formId + '/versions', {
      text: JSON.stringify(config),
    });
    const { releaseId } = await post<{ releaseId: string }>('forms/' + formId + '/releases', {
      versionId,
      profile: 'main',
    });
    await page.goto('/host?releaseId=' + releaseId);
    const instance = page.getByRole('region', { name: '已装载实例' });
    const record = instance.getByRole('textbox', { name: '测试单据编号', exact: true });
    const cases = [
      { targetId: 'zero-divisor', field: scenario.divisor, value: '0', error: 'division by zero' },
      {
        targetId: 'amount-overflow',
        field: scenario.scale,
        value: '10',
        error: 'non-finite result',
      },
    ];
    const errors = [];
    for (const sample of cases) {
      const control = instance.getByRole('textbox', { name: sample.field, exact: true });
      for (let turn = 1; turn <= 5; turn++) {
        await control.fill('1');
        const recordId = [scenario.key, sample.targetId, turn].join('-');
        await record.fill(recordId);
        const uploaded = page.waitForResponse(
          (response) =>
            response.url().endsWith('/diagnostics/pilot/events') &&
            response.request().method() === 'POST',
        );
        await control.fill(sample.value);
        const response = await uploaded;
        expect(response.status(), await response.text()).toBe(201);
        const { diagnosticId } = (await response.json()) as { diagnosticId: string };
        allDiagnosticIds.add(diagnosticId);
        const detail = await get<{
          formId: string;
          versionId: string;
          releaseId: string;
          targetId: string;
          evidenceStatus: string;
          evidence: { input: { snapshot: { record: string } }; error: { message: string } };
        }>('diagnostics/events/' + diagnosticId);
        expect(detail).toMatchObject({
          formId,
          versionId,
          releaseId,
          targetId: sample.targetId,
          evidenceStatus: 'captured',
          evidence: { input: { snapshot: { record: recordId } } },
        });
        expect(detail.evidence.error.message).toContain(sample.error);
        errors.push({ diagnosticId, recordId, expected: sample.error, ...detail });
      }
    }
    const groups = await get<Array<{ targetId: string; count: number }>>(
      'diagnostics/groups?releaseId=' + releaseId,
    );
    expect(groups).toHaveLength(2);
    expect(groups).toEqual(
      expect.arrayContaining(
        cases.map(({ targetId }) => expect.objectContaining({ targetId, count: 5 })),
      ),
    );
    corpus.push({ name: scenario.name, formId, versionId, releaseId, config, groups, errors });
  }
  expect(allDiagnosticIds.size).toBe(50);
  const path = testInfo.outputPath('form-error-corpus.json');
  await writeFile(path, JSON.stringify({ format: 1, fixtures: corpus }, null, 2) + '\n');
  await testInfo.attach('form-error-corpus', { path, contentType: 'application/json' });
});
