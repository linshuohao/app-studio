import { expect, it } from 'vitest';
import type { JsonValue } from '@form-engine/protocol';
import { invoke } from '../../src/expense-count-invoice-matches/implementation.js';

it('counts both invoice rows ignoring internal whitespace and case', () => {
  const rows: JsonValue[] = [
    { invoiceId: 'ab 1234' },
    { invoiceId: ' A\tB1234\n' },
    { invoiceId: 'AB1235' },
    {},
  ];
  expect(invoke([rows, 'ab 1234'])).toBe(2);
  expect(invoke([rows, 'AB1235'])).toBe(1);
  expect(invoke([rows, ' '])).toBe(0);
});
