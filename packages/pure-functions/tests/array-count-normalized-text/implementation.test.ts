import { expect, it } from 'vitest';
import { invoke } from '../../src/array-count-normalized-text/implementation.js';

it('counts every normalized duplicate including the current row without rewriting text', () => {
  const rows = Object.freeze([{ sku: ' CAB ' }, { sku: 'cab' }, { sku: 'Cab-1' }, { sku: 2 }]);
  expect(invoke([rows.slice(), 'sku', 'CAB'])).toBe(2);
  expect(rows[0]?.sku).toBe(' CAB ');
});

it('ignores blank and non-text values and inherited properties', () => {
  expect(invoke([[{ sku: '' }, { sku: '   ' }, null], 'sku', ' '])).toBe(0);
  expect(invoke([[{}, null, []], 'constructor', 'Object'])).toBe(0);
  expect(invoke([null, 'sku', 'a'])).toBeNull();
  expect(() => invoke([[], '', 'a'])).toThrow();
});
