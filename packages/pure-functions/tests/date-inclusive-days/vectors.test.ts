import { expect, it } from 'vitest';
import { gregorianDates } from '../../../../tests/fixtures/gregorian-dates.js';
import { invoke } from '../../src/date-inclusive-days/implementation.js';
it('uses shared Gregorian date vectors without depending on UI code', () => {
  for (const [date, valid] of gregorianDates) expect(invoke([date, date])).toBe(valid ? 1 : null);
});
