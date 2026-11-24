import { expect, it } from 'vitest';
import { invoke } from '../../src/travel-person-premium/implementation.js';
import { ratePolicy } from '../fixtures/policy.js';
it.each(
  [
    [30, 'basic', 2, 200],
    [12, 'basic', 2, 300],
    [0, 'plus', 1, 250],
    [18, 'plus', 30, 5400],
    ['18', 'basic', 2, null],
    [81, 'basic', 2, null],
    [12, 'legacy', 2, null],
    [12, 'basic', 0, null],
    [12, 'basic', 31, null],
    [12, 'basic', 1.5, null],
    [12, 'basic', '2', null],
    [null, 'basic', 2, null],
  ].map(([age, plan, days, result]) => ({ age, plan, days, result })),
)('quotes $age / $plan / $days as $result', ({ age, plan, days, result }) =>
  expect(invoke([age!, plan!, days!, ratePolicy])).toBe(result),
);
it('accepts zero daily rate and does not mutate frozen input', () => {
  const policy = Object.freeze({
    ...ratePolicy,
    rates: { ...ratePolicy.rates, basic: { adultDailyMinor: 0, childDailyMinor: 0 } },
  });
  expect(invoke(Object.freeze([30, 'basic', 2, policy]))).toBe(0);
});
it.each([
  { ...ratePolicy, maxDays: 0 },
  { ...ratePolicy, maxInsureds: 0 },
  { ...ratePolicy, rates: { basic: { adultDailyMinor: 1, childDailyMinor: 1 } } },
  {
    ...ratePolicy,
    rates: { ...ratePolicy.rates, basic: { adultDailyMinor: -1, childDailyMinor: 1 } },
  },
  { ...ratePolicy, agePolicy: { minAge: 80, maxAge: 0, adultAge: 18 } },
])('throws for invalid rate config %j', (policy) =>
  expect(() => invoke([null, null, null, policy])).toThrow(),
);
it('throws on multiplication overflow', () =>
  expect(() =>
    invoke([
      30,
      'basic',
      2,
      {
        ...ratePolicy,
        rates: {
          ...ratePolicy.rates,
          basic: { adultDailyMinor: Number.MAX_SAFE_INTEGER, childDailyMinor: 1 },
        },
      },
    ]),
  ).toThrow());
