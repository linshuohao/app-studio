import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { setup } from '../fixtures.js';
it.each([
  [{ value: 500, format: 'moneyMinor' }, '¥5.00'],
  [{ value: 0, format: 'integer' }, '0'],
  [{ value: false }, 'false'],
  [{ value: { private: 'hidden' } }, '—'],
  [{ value: 1.2, format: 'integer' }, '—'],
  [{ value: null, emptyText: '暂无' }, '暂无'],
])('formats supported values and never dumps technical objects', (props, text) => {
  setup({ material: 'value-display', props });
  expect(screen.getByText(text as string)).toBeVisible();
});
