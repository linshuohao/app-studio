import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function headingPreview(story = 'page-heading') {
  const handbook =
    process.env.STUDIO_HANDBOOK_ROOT ?? fileURLToPath(new URL('../dist', import.meta.url));
  const runner = pathToFileURL(
    resolve(handbook, 'studio-components/assets/business-playground-runner.html'),
  ).href;
  return runner + '?run#' + story;
}

test('edits a page title by keyboard and restores focus when saving or cancelling', async ({
  page,
}) => {
  await page.goto(headingPreview());

  const initial = page.getByRole('button', { name: '编辑表单名称：差旅审批单' });
  await initial.focus();
  await page.keyboard.press('Enter');
  const input = page.getByRole('textbox', { name: '表单名称', exact: true });
  await expect(input).toBeFocused();
  await input.fill('取消这次修改');
  await input.press('Escape');
  await expect(initial).toBeFocused();

  await page.keyboard.press('Enter');
  await input.fill('  差旅报销单  ');
  await input.press('Enter');
  const saved = page.getByRole('button', { name: '编辑表单名称：差旅报销单' });
  await expect(saved).toBeFocused();

  await page.keyboard.press('Enter');
  await input.fill('新差旅报销单');
  await input.press('Tab');
  await expect(page.getByRole('heading', { name: '新差旅报销单', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '重置', exact: true })).toBeFocused();
});

test('preserves the next action focus when an asynchronous title save completes', async ({
  page,
}) => {
  await page.goto(headingPreview('page-heading-async'));
  await page.getByRole('button', { name: '编辑表单名称：差旅审批单' }).press('Enter');
  const input = page.getByRole('textbox', { name: '表单名称', exact: true });
  await input.fill('差旅报销单');
  await input.press('Enter');
  await page.evaluate(() => {
    document.addEventListener(
      'keydown',
      (event) => {
        document.body.dataset.renameEnterPrevented = String(event.defaultPrevented);
      },
      { once: true },
    );
  });
  await input.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-rename-enter-prevented', 'true');
  await input.press('Tab');

  const reset = page.getByRole('button', { name: '重置', exact: true });
  await expect(reset).toBeFocused();
  await page
    .getByRole('button', { name: '完成保存', exact: true })
    .evaluate((button) => button.click());
  await expect(page.getByRole('button', { name: '编辑表单名称：差旅报销单' })).toBeVisible();
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  await expect(reset).toBeFocused();
});

test('prevents submission when title editing is disabled during an edit', async ({ page }) => {
  await page.goto(headingPreview());
  const initial = page.getByRole('button', { name: '编辑表单名称：差旅审批单' });
  await initial.press('Enter');
  const input = page.getByRole('textbox', { name: '表单名称', exact: true });
  await input.fill('不得保存的更名');
  const disable = page.getByRole('button', { name: '禁用标题编辑', exact: true });
  // Change the parent state while the input is still focused.
  await disable.evaluate((button) => button.click());
  await expect(disable).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Enter');
  await expect(initial).toBeDisabled();
});
