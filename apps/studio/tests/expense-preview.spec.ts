import { expect, test } from '@playwright/test';
import { openSchemaDraft } from './data-schema-fixture';

test('adds the first and subsequent expense rows in Studio preview', async ({ page }) => {
  const definition = {
    protocolVersion: '1',
    id: 'expense-preview-test',
    version: 'draft',
    data: {
      schema: {
        type: 'object',
        properties: {
          expenses: {
            type: 'array',
            items: { type: 'object', properties: { expenseId: { type: 'string' } } },
          },
        },
      },
    },
    views: {
      desktop: {
        material: 'section',
        slots: {
          default: [
            {
              material: 'button',
              props: { label: '新增报销明细' },
              on: { activate: { type: 'host.emit', event: 'business.addExpense' } },
            },
            {
              scope: { from: { source: 'data', path: '/expenses' }, as: 'expense', mode: 'each' },
              node: {
                material: 'value-display',
                props: {
                  value: {
                    $expr: { ref: { source: 'data', path: '/expenseId', scope: 'expense' } },
                  },
                },
              },
            },
          ],
        },
      },
    },
  };
  await openSchemaDraft(page, JSON.stringify(definition));
  await page.getByRole('button', { name: '预览配置', exact: true }).click();
  const preview = page.getByRole('region', { name: '受控预览' });
  const add = preview.getByRole('button', { name: '新增报销明细', exact: true });
  const rowIds = preview.getByText(
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
  );
  await expect(rowIds).toHaveCount(0);
  await add.click();
  await expect(rowIds).toHaveCount(1);
  const first = await rowIds.first().textContent();
  await add.click();
  await expect(rowIds).toHaveCount(2);
  expect(await rowIds.nth(1).textContent()).not.toBe(first);
  expect(await rowIds.first().textContent()).toBe(first);
  for (let i = 2; i < 41; i++) await add.click();
  await expect(rowIds).toHaveCount(40);
  await expect(preview.getByText('报销明细最多 40 条。')).toBeVisible();
});
