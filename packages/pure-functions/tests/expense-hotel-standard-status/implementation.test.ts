import { expect, it } from 'vitest';
import { invoke } from '../../src/expense-hotel-standard-status/implementation.js';

it('distinguishes the exact boundary from over-standard and invalid values', () => {
  expect(invoke([90000, 2])).toBe('within');
  expect(invoke([90001, 2])).toBe('over');
  expect(invoke([90000.5, 2])).toBe('invalid');
  expect(invoke([75000, 2.5])).toBe('invalid');
  expect(invoke([null, 2])).toBe('invalid');
  expect(invoke([45000, 31])).toBe('invalid');
});
