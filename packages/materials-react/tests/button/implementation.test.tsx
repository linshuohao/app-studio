import { expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { setup, ref } from '../fixtures.js';
it('emits one payload-free activation and defaults to a non-submit button', () => {
  const form = setup({
    material: 'button',
    props: { label: '执行' },
    on: {
      activate: { type: 'form.command', command: { op: 'set', target: ref(), value: 'done' } },
    },
  });
  const button = screen.getByRole('button', { name: '执行' });
  expect(button).toHaveAttribute('type', 'button');
  fireEvent.click(button);
  expect(form.value()).toEqual({ kind: 'value', value: 'done' });
  expect(form.runtime.interact).toHaveBeenCalledTimes(1);
});

it('supports dynamic disabled with a statically selected variant', () => {
  const form = setup(
    {
      material: 'button',
      props: {
        label: '动态删除',
        variant: 'danger',
        disabled: { $expr: { ref: ref('/disabled') } },
      },
      on: {
        activate: { type: 'form.command', command: { op: 'set', target: ref(), value: 'done' } },
      },
    },
    '',
    true,
    true,
    {
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: { value: { type: 'string' }, disabled: { type: 'boolean' } },
          },
        },
      },
      initial: { value: '', disabled: true },
    },
  );
  const button = screen.getByRole('button', { name: '动态删除' });
  expect(button).toBeDisabled();
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/disabled'), value: false });
  });
  fireEvent.click(button);
  expect(form.value()).toEqual({ kind: 'value', value: 'done' });
});
