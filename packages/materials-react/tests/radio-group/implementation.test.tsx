import { expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { field, setup } from '../fixtures.js';

it('replaces the selected ID when navigating the radio group with arrows', async () => {
  const form = setup(
    field('radio-group', {
      options: [
        { id: 'email', label: '邮件' },
        { id: 'sms', label: '短信' },
      ],
    }),
    'email',
  );
  const user = userEvent.setup();
  await user.tab();
  expect(screen.getByRole('radio', { name: '邮件' })).toHaveFocus();
  await user.keyboard('{ArrowRight}');
  expect(form.runtime.snapshot()).toEqual({ value: 'sms' });
});
