import type { JsonValue } from '@form-engine/protocol';
function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}
/** Gregorian ordinal; no Date constructor, current time, timezone or elapsed milliseconds. */
function ordinal(value: JsonValue | undefined): number | null {
  if (typeof value !== 'string' || value.length !== 10) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]),
    month = Number(match[2]),
    day = Number(match[3]);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const leap = isLeapYear(year);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > lengths[month - 1]!) return null;
  const prior = year - 1;
  return (
    prior * 365 +
    Math.floor(prior / 4) -
    Math.floor(prior / 100) +
    Math.floor(prior / 400) +
    lengths.slice(0, month - 1).reduce((sum, n) => sum + n, 0) +
    day
  );
}
export function inclusiveDays(
  start: JsonValue | undefined,
  end: JsonValue | undefined,
): number | null {
  const a = ordinal(start),
    b = ordinal(end);
  return a === null || b === null || b < a ? null : b - a + 1;
}

export function ageInYears(
  birthDate: JsonValue | undefined,
  asOfDate: JsonValue | undefined,
): number | null {
  if (typeof birthDate !== 'string' || typeof asOfDate !== 'string') return null;
  if (inclusiveDays(birthDate, asOfDate) === null) return null;
  const year = Number(asOfDate.slice(0, 4));
  const birthYear = Number(birthDate.slice(0, 4));
  const birthday = birthDate.slice(5);
  const anniversary = birthday === '02-29' && !isLeapYear(year) ? '02-28' : birthday;
  return year - birthYear - Number(asOfDate.slice(5) < anniversary);
}
