import { expect, it } from 'vitest';
import { invoke } from '../../src/travel-is-eligible-age/implementation.js';
import { agePolicy } from '../fixtures/policy.js';
it.each([0, 18, 80])('accepts integer age %s without coercion', (age) =>
  expect(invoke([age, agePolicy])).toBe(true),
);
it.each([-1, 81, 1.5, '18', '-', null, false, {}, []].map((age) => ({ age })))(
  'rejects working value $age',
  ({ age }) => expect(invoke([age, agePolicy])).toBe(false),
);
it.each([
  {},
  null,
  { ...agePolicy, minAge: 81 },
  { ...agePolicy, adultAge: 1.5 },
  { ...agePolicy, maxAge: Number.MAX_SAFE_INTEGER + 1 },
  { ...agePolicy, unknown: 1 },
])('throws for malformed or contradictory policy %j even with invalid work', (policy) =>
  expect(() => invoke([null, policy])).toThrow(),
);
it('rejects wrong arity', () => expect(() => invoke([18])).toThrow());
