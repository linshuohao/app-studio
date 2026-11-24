import { expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { setup, field } from '../fixtures.js';
it.each([
  ['18', 18],
  ['0', 0],
  ['-2.5', -2.5],
  ['.5', 0.5],
  ['', null],
  ['-', '-'],
  ['1.', '1.'],
  ['1e3', '1e3'],
  [' 2 ', ' 2 '],
  ['1,000', '1,000'],
  ['9007199254740993', '9007199254740993'],
  ['0.10000000000000001', '0.10000000000000001'],
])('parses %j without silently losing information', (text, value) => {
  const form = setup(field('number-input'), null, { type: ['number', 'null'] });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: text } });
  expect(form.value()).toEqual({ kind: 'value', value });
});
it('keeps editing spelling locally then formats a valid number; Host updates win over blur', async () => {
  const form = setup(field('number-input'), 0, { type: ['number', 'null'] });
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: '01.50' } });
  expect(form.value()).toEqual({ kind: 'value', value: 1.5 });
  expect(input).toHaveValue('01.50');
  fireEvent.blur(input);
  expect(input).toHaveValue('1.5');
  fireEvent.change(input, { target: { value: '002' } });
  await form.set(9);
  fireEvent.blur(input);
  expect(input).toHaveValue('9');
  expect(form.value()).toEqual({ kind: 'value', value: 9 });
});
