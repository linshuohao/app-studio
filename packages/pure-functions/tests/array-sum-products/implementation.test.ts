import { expect, it } from 'vitest';
import { invoke } from '../../src/array-sum-products/implementation.js';

it('sums all products in integer minor units and treats an empty list as zero', () => {
  expect(
    invoke([
      [
        { q: 2, price: 150000 },
        { q: 3, price: 100000 },
      ],
      'q',
      'price',
    ]),
  ).toBe(600000);
  expect(invoke([[], 'q', 'price'])).toBe(0);
});
it('rejects incomplete amounts and unsafe products or totals', () => {
  const max = Number.MAX_SAFE_INTEGER;
  expect(invoke([[{ q: 1, price: 1 }, { q: 2 }], 'q', 'price'])).toBeNull();
  expect(invoke([[{ q: 2, price: max }], 'q', 'price'])).toBeNull();
  expect(
    invoke([
      [
        { q: 1, price: max },
        { q: 1, price: 1 },
      ],
      'q',
      'price',
    ]),
  ).toBeNull();
  expect(invoke([[{ q: 1.5, price: 1 }], 'q', 'price'])).toBeNull();
  expect(() => invoke([[], 'q'])).toThrow();
});
