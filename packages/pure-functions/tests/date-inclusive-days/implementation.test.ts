import { expect, it } from 'vitest';
import { invoke } from '../../src/date-inclusive-days/implementation.js';
it.each(
  [
    ['2028-02-28', '2028-03-01', 3],
    ['2028-02-29', '2028-02-29', 1],
    ['1900-02-28', '1900-03-01', 2],
    ['2000-02-28', '2000-03-01', 3],
    ['0001-01-01', '9999-12-31', 3652059],
    ['0099-12-31', '0100-01-01', 2],
    ['2028-03-01', '2028-02-28', null],
    ['2027-02-29', '2027-03-01', null],
    ['0000-01-01', '0001-01-01', null],
    ['10000-01-01', '9999-12-31', null],
    ['2028-2-01', '2028-03-01', null],
    ['2028-04-31', '2028-05-01', null],
    ['2028-01-01\n', '2028-01-02', null],
    ['', '2028-01-02', null],
    [null, '2028-01-02', null],
    [{}, '2028-01-02', null],
  ].map(([start, end, result]) => ({ start, end, result })),
)('counts $start → $end as $result', ({ start, end, result }) =>
  expect(invoke([start!, end!])).toBe(result),
);
it('rejects wrong arity', () => expect(() => invoke([])).toThrow());
