import { expect, it } from 'vitest';
import { invoke } from '../../src/travel-requires-guardian/implementation.js';
import { agePolicy } from '../fixtures/policy.js';
it.each(
  [
    [0, true],
    [17, true],
    [18, false],
    [80, false],
    [-1, false],
    ['12', false],
    [null, false],
  ].map(([age, result]) => ({ age, result })),
)('returns $result for $age', ({ age, result }) => expect(invoke([age!, agePolicy])).toBe(result));
it('uses explicit policy and refuses wrong config', () => {
  expect(invoke([20, { minAge: 0, maxAge: 80, adultAge: 21 }])).toBe(true);
  expect(() => invoke([12, { ...agePolicy, minAge: 90 }])).toThrow();
  expect(() => invoke([])).toThrow();
});
