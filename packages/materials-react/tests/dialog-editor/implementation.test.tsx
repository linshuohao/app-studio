import { beforeEach, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { setup, field } from '../fixtures.js';
// jsdom does not implement native dialog focus/inert behavior; actual browser tests cover it.
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
});
it('commits Slot inputs live and closes without rollback; reopening reads Runtime', async () => {
  const form = setup(
    {
      material: 'dialog-editor',
      props: { title: '编辑成员' },
      slots: {
        summary: [{ material: 'value-display', props: { value: '摘要' } }],
        content: [field('text-input')],
      },
    },
    'A',
  );
  expect(screen.getByText('摘要')).toBeVisible();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  const trigger = screen.getByRole('button', { name: '编辑' });
  fireEvent.click(trigger);
  expect(screen.getByRole('dialog', { name: '编辑成员' })).toBeVisible();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '已写入' } });
  fireEvent.click(screen.getByRole('button', { name: '完成' }));
  expect(form.value()).toEqual({ kind: 'value', value: '已写入' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  await form.set('Host');
  fireEvent.click(trigger);
  expect(screen.getByRole('textbox')).toHaveValue('Host');
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await act(() => form.runtime.flush());
});
it('disables the trigger and cleans up its portal on unmount under Strict Mode', () => {
  const form = setup(
    {
      material: 'dialog-editor',
      props: { title: '编辑', disabled: true },
      slots: { content: [field('text-input')] },
    },
    'A',
    undefined,
    true,
    { strict: true },
  );
  expect(screen.getByRole('button', { name: '编辑' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  form.unmount();
  expect(document.querySelector('dialog')).toBeNull();
});

it('keeps the single-date calendar inside its containing dialog', async () => {
  const form = setup(
    {
      material: 'dialog-editor',
      props: { title: '编辑成员' },
      slots: { content: [field('date-picker')] },
    },
    '2028-02-28',
  );
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  const modal = screen.getByRole('dialog', { name: '编辑成员' });
  fireEvent.click(within(modal).getByRole('button', { name: '测试字段' }));
  const grid = await within(modal).findByRole('grid');
  const day = grid.querySelector('[data-day="2028-02-29"] button');
  expect(day).toBeEnabled();
  if (day) fireEvent.click(day);
  expect(form.runtime.snapshot()).toEqual({ value: '2028-02-29' });
});
