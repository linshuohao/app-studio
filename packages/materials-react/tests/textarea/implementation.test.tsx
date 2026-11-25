import { expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { field, setup } from '../fixtures.js';

it('preserves line breaks when the user edits a multiline field', () => {
  const form = setup(field('textarea'), '');
  const input = screen.getByRole('textbox', { name: '测试字段' });
  fireEvent.change(input, { target: { value: '第一行\n第二行' } });
  expect(form.runtime.snapshot()).toEqual({ value: '第一行\n第二行' });
});
