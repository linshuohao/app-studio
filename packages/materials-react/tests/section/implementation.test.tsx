import { expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { setup, field, ref } from '../fixtures.js';
it('collapses only presentation and retains written data and validation', async () => {
  const form = setup(
    {
      material: 'section',
      props: { title: '投保人', description: '填写基本信息', collapsible: true },
      slots: {
        default: [field('text-input')],
        actions: [
          {
            material: 'button',
            props: { label: '章节操作' },
            on: {
              activate: {
                type: 'form.command',
                command: { op: 'set', target: ref(), value: 'action' },
              },
            },
          },
        ],
      },
    },
    'Alice',
    { type: 'string', minLength: 1 },
  );
  expect(screen.getByText('填写基本信息')).toBeVisible();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
  await act(() => form.runtime.flush());
  fireEvent.click(screen.getByRole('button', { name: '投保人' }));
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(form.value()).toEqual({ kind: 'value', value: '' });
  expect((await form.runtime.validate()).status).toBe('invalid');
  fireEvent.click(screen.getByRole('button', { name: '投保人' }));
  expect(screen.getByRole('textbox')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: '章节操作' }));
  expect(form.value()).toEqual({ kind: 'value', value: 'action' });
});
it('uses defaultExpanded only for each mount and does not collapse a non-collapsible section', () => {
  const form = setup(
    {
      material: 'section',
      props: {
        title: '章节',
        collapsible: { $expr: { ref: ref('/collapsible') } },
        defaultExpanded: { $expr: { ref: ref('/expanded') } },
      },
      slots: { default: [field('text-input')] },
    },
    'A',
    true,
    true,
    {
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: {
              value: { type: 'string' },
              collapsible: { type: 'boolean' },
              expanded: { type: 'boolean' },
            },
          },
        },
      },
      initial: { value: 'A', collapsible: true, expanded: false },
    },
  );
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '章节' }));
  expect(screen.getByRole('textbox')).toHaveValue('A');
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/expanded'), value: true });
  });
  expect(screen.getByRole('button', { name: '章节' })).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: '章节' }));
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/collapsible'), value: false });
  });
  expect(screen.getByRole('textbox')).toHaveValue('A');
  expect(screen.queryByRole('button', { name: '章节' })).not.toBeInTheDocument();
});
