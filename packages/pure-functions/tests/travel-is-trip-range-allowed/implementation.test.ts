import { expect, it } from 'vitest';
import { invoke } from '../../src/travel-is-trip-range-allowed/implementation.js';
it.each(
  [
    ['2028-01-01', '2028-01-01', 1, true],
    ['2028-01-01', '2028-01-30', 30, true],
    ['2028-01-01', '2028-01-31', 30, false],
    ['2028-02-28', '2028-03-01', 2, false],
    [null, '2028-01-01', 30, false],
    ['2028-02-29', '2028-02-28', 30, false],
  ].map(([start, end, maxDays, result]) => ({ start, end, maxDays, result })),
)('checks explicit limit $maxDays for $start → $end', ({ start, end, maxDays, result }) =>
  expect(invoke([start!, end!, maxDays!])).toBe(result),
);
it.each([0, -1, 1.5, '30', null, Number.MAX_SAFE_INTEGER + 1])(
  'rejects invalid maxDays %j',
  (maxDays) => expect(() => invoke([null, null, maxDays])).toThrow(),
);
