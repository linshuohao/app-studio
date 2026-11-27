import { expect, type Locator, type Page } from '@playwright/test';

export async function chooseCalendarDay(scope: Page | Locator, isoDate: string) {
  const calendar = scope.locator('[data-slot="calendar"]');
  const year = calendar.getByRole('textbox', { name: '年份', exact: true });
  const [yearText, monthText] = isoDate.split('-');
  if (!yearText || !monthText) throw new Error('Expected an ISO date');
  if ((await year.inputValue()) !== yearText) {
    await year.fill(yearText);
    await year.press('Enter');
  }
  const month = calendar.getByRole('combobox');
  await month.selectOption(String(Number(monthText) - 1));
  const day = calendar.getByRole('grid').locator(`[data-day="${isoDate}"] button`);
  await expect(day).toBeEnabled();
  await day.click();
}

export async function chooseRangeDay(
  dialog: Locator,
  endpoint: '开始日期' | '结束日期',
  isoDate: string,
) {
  await dialog.getByRole('button', { name: `打开${endpoint}日历`, exact: true }).click();
  await chooseCalendarDay(dialog, isoDate);
}
