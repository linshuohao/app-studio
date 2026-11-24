import { expect, it } from 'vitest';
import type { JsonValue } from '@form-engine/protocol';
import { invoke } from '../../src/travel-total-premium/implementation.js';
import { ratePolicy } from '../fixtures/policy.js';
it('totals the golden adult + child as 500 and ignores unrelated member fields', () => {
  const people: JsonValue[] = [
    { age: 30, name: '', idNumber: '' },
    { age: 12, guardianName: '' },
  ];
  expect(invoke([people, 'basic', 2, ratePolicy])).toBe(500);
  expect(people[0]).toMatchObject({ age: 30 });
});
it.each(
  [
    null,
    {},
    [],
    Array.from({ length: 6 }, () => ({ age: 30 })),
    [{ age: 30 }, { age: '12' }],
    [{ age: 30 }, {}],
    [null],
    [[]],
  ].map((insureds) => ({ insureds })),
)('refuses partial totals for $insureds', ({ insureds }) =>
  expect(invoke([insureds, 'basic', 2, ratePolicy])).toBe(null),
);
it('accepts exactly five, checks every age and reuses person semantics', () => {
  expect(invoke([Array.from({ length: 5 }, () => ({ age: 18 })), 'plus', 1, ratePolicy])).toBe(900);
  expect(invoke([[{ age: 30 }], 'unknown', 2, ratePolicy])).toBe(null);
  expect(invoke([[{ age: 30 }], 'basic', null, ratePolicy])).toBe(null);
});
it('throws if sum overflows even when individual premiums are safe', () =>
  expect(() =>
    invoke([
      [{ age: 30 }, { age: 30 }],
      'basic',
      1,
      {
        ...ratePolicy,
        rates: {
          ...ratePolicy.rates,
          basic: { adultDailyMinor: Number.MAX_SAFE_INTEGER, childDailyMinor: 1 },
        },
      },
    ]),
  ).toThrow());
it('validates policy before returning null and enforces arity', () => {
  expect(() => invoke([null, null, null, {}])).toThrow();
  expect(() => invoke([])).toThrow();
});
it('returns null for an invalid member before attempting arithmetic, regardless of member order', () => {
  const policy = {
    ...ratePolicy,
    rates: {
      ...ratePolicy.rates,
      basic: { adultDailyMinor: Number.MAX_SAFE_INTEGER, childDailyMinor: 1 },
    },
  };
  expect(invoke([[{ age: 30 }, { age: '-' }], 'basic', 2, policy])).toBe(null);
  expect(invoke([[{ age: '-' }, { age: 30 }], 'basic', 2, policy])).toBe(null);
});
