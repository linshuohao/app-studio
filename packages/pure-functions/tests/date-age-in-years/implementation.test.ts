import { expect, it } from 'vitest';
import { invoke } from '../../src/date-age-in-years/implementation.js';

it.each([
  ['1956-02-29', '2026-02-27', 69],
  ['1956-02-29', '2026-02-28', 70],
  ['1956-02-29', '2028-02-28', 71],
  ['1956-02-29', '2028-02-29', 72],
  ['2026-01-15', '2026-01-15', 0],
  ['2026-01-15', '2026-01-14', null],
  ['2026-02-29', '2027-03-01', null],
  [null, '2026-01-01', null],
])('calculates age for %s on %s', (birthDate, asOfDate, expected) => {
  expect(invoke([birthDate, asOfDate])).toBe(expected);
});
