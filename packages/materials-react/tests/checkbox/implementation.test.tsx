import { expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { setup, field } from '../fixtures.js';
it('keeps invalid data observable without repairing it on mount and writes booleans on user action', async () => {
  const form = setup(field('checkbox', { label: '确认信息' }), 'invalid', { type: 'boolean' });
  const input = screen.getByRole('checkbox', { name: '确认信息' });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByText('当前值不是有效的勾选值')).toBeVisible();
  expect(form.value()).toEqual({ kind: 'value', value: 'invalid' });
  fireEvent.click(input);
  expect(form.value()).toEqual({ kind: 'value', value: true });
  await form.set(false);
  expect(input).not.toBeChecked();
});
