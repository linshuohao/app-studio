/** UI parsing only; no clock/timezone, business duration or range policy. */
export function isDate(text: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return false;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}
export function draftText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function displayDate(value: unknown): string {
  if (value === null || value === undefined || value === '') return '未选择';
  return typeof value === 'string' ? value : '日期格式无效';
}
