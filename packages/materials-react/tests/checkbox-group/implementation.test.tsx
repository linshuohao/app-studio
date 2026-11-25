import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { field, setup } from '../fixtures.js';

it('writes an empty array when the last selected option is cleared', async () => {
  const form = setup(
    field('checkbox-group', {
      options: [
        { id: 'email', label: '邮件' },
        { id: 'sms', label: '短信' },
      ],
    }),
    ['email'],
    { type: 'array', items: { type: 'string' } },
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('checkbox', { name: '邮件' }));
  expect(form.runtime.snapshot()).toEqual({ value: [] });
});

it('allows explicitly clearing a saved option no longer present in the catalog', async () => {
  const form = setup(
    field('checkbox-group', { options: [{ id: 'email', label: '邮件' }] }),
    ['retired'],
    { type: 'array', items: { type: 'string' } },
  );
  await userEvent.setup().click(screen.getByRole('button', { name: '清空多选' }));
  expect(form.runtime.snapshot()).toEqual({ value: [] });
});
