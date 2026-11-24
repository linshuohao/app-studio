import { expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setup, field } from '../fixtures.js';
it('connects labels/help and existing Issues without a second validation store', async () => {
  const form = setup(field('text-input'), '', { type: 'string', minLength: 1 });
  const input = screen.getByRole('textbox', { name: /测试字段/ });
  await userEvent.click(screen.getByText('测试字段'));
  expect(input).toHaveFocus();
  expect(input).toHaveAccessibleDescription(/字段帮助/);
  await act(async () => {
    await form.runtime.validate();
  });
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(screen.getByRole('list', { name: '字段问题' })).toBeVisible();
  expect(screen.getAllByRole('listitem')).toHaveLength(
    form.runtime.getValidation({ source: 'data', path: '/value' }).issues.length,
  );
  fireEvent.change(input, { target: { value: '有效姓名' } });
  await act(() => form.runtime.flush());
  expect(input).toHaveAttribute('aria-invalid', 'false');
});
it('uses unique IDs for multiple controls and focuses the first one from the field label', async () => {
  const form = setup(
    {
      material: 'field',
      props: { label: '双输入' },
      bindings: { value: { source: 'data', path: '/value' } },
      slots: {
        default: [
          { material: 'text-input', bindings: { value: { source: 'data', path: '/value' } } },
          { material: 'text-input', bindings: { value: { source: 'data', path: '/value' } } },
        ],
      },
    },
    'text',
  );
  const inputs = screen.getAllByRole('textbox');
  expect(inputs[0]!.id).not.toBe(inputs[1]!.id);
  await userEvent.click(screen.getByText('双输入'));
  expect(inputs[0]).toHaveFocus();
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
