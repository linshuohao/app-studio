import { expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { setup, field, ref } from '../fixtures.js';
it('unmounts the hidden Slot while preserving its data and applicable rules', async () => {
  const form = setup(
    {
      material: 'condition',
      props: { visible: { $expr: { ref: ref('/show') } } },
      slots: { default: [field('text-input')] },
    },
    '',
    true,
    true,
    {
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: { show: { type: 'boolean' }, value: { type: 'string', minLength: 1 } },
          },
        },
      },
      initial: { show: true, value: 'A' },
    },
  );
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: false });
  });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(form.value()).toEqual({ kind: 'value', value: '' });
  await act(async () => {
    expect((await form.runtime.validate()).status).toBe('invalid');
  });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref(), value: 'Host' });
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: true });
  });
  expect(screen.getByRole('textbox')).toHaveValue('Host');
});
