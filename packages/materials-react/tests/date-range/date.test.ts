import { expect, it } from 'vitest';
import { gregorianDates } from '../../../../tests/fixtures/gregorian-dates.js';
import { isDate } from '../../src/_internal/date.js';
it('uses the same Gregorian date vectors as domain functions without a production dependency', () => {
  for (const [date, valid] of gregorianDates) expect(isDate(date)).toBe(valid);
});
