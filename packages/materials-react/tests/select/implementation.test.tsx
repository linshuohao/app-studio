import { expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { setup, field } from '../fixtures.js';
it('preserves unknown IDs and supports empty-string IDs without colliding with clear', () => {
  const form = setup(
    field('select', {
      options: [
        { id: '', label: '空标识选项' },
        { id: 'plus', label: '升级方案' },
      ],
    }),
    'unknown',
  );
  const input = screen.getByRole('combobox');
  expect((screen.getByRole('option', { name: '选项不可用' }) as HTMLOptionElement).selected).toBe(
    true,
  );
  expect(form.value()).toEqual({ kind: 'value', value: 'unknown' });
  const plus = screen.getByRole('option', { name: '升级方案' }) as HTMLOptionElement;
  fireEvent.change(input, { target: { value: plus.value } });
  expect(form.value()).toEqual({ kind: 'value', value: 'plus' });
  const empty = screen.getByRole('option', { name: '空标识选项' }) as HTMLOptionElement;
  fireEvent.change(input, { target: { value: empty.value } });
  expect(form.value()).toEqual({ kind: 'value', value: '' });
  const clear = screen.getByRole('option', { name: '请选择' }) as HTMLOptionElement;
  fireEvent.change(input, { target: { value: clear.value } });
  expect(form.value()).toEqual({ kind: 'value', value: null });
});
it('does not clear a non-clearable selector or write while disabled', () => {
  const form = setup(
    field('select', { options: [{ id: 'a', label: '选项 A' }], clearable: false, disabled: true }),
    'a',
  );
  const select = screen.getByRole('combobox');
  expect(select).toBeDisabled();
  expect(screen.getByRole('option', { name: '请选择' })).toBeDisabled();
  fireEvent.change(select, { target: { value: 'empty' } });
  expect(form.value()).toEqual({ kind: 'value', value: 'a' });
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
