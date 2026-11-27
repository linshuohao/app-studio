import { expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
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

it('removes the clicked member by Scope and keeps the surviving member’s field error', async () => {
  const roster = ref('/insureds');
  const currentPassport = ref('/passportNumber', 'member');
  const scope = { from: roster, as: 'member', mode: 'each' as const };
  const self = { passportNumber: 'P001' };
  const second = { passportNumber: 'P002' };
  const third = { passportNumber: 'P03' };
  const form = setup(
    {
      scope,
      node: {
        material: 'section',
        props: { title: '成员' },
        slots: {
          actions: [
            {
              material: 'button',
              props: { label: '删除成员' },
              on: {
                activate: {
                  type: 'form.command',
                  command: { op: 'array.remove', target: roster, item: { $scope: 'member' } },
                },
              },
            },
          ],
          default: [
            {
              material: 'field',
              props: { label: '护照号码' },
              bindings: { value: currentPassport },
              slots: {
                default: [{ material: 'text-input', bindings: { value: currentPassport } }],
              },
            },
          ],
        },
      },
    },
    '',
    undefined,
    true,
    {
      initial: { insureds: [self, second, third] },
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: {
              insureds: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { passportNumber: { type: 'string', minLength: 4 } },
                },
              },
            },
          },
        },
      },
    },
  );

  await act(async () => {
    await form.runtime.validate();
  });
  const [, secondCard, thirdCard] = screen.getAllByRole('region', { name: '成员' });
  if (!secondCard || !thirdCard) throw new Error('Expected the second and third member cards');
  expect(within(secondCard).getByLabelText('护照号码')).toHaveAttribute('aria-invalid', 'false');
  expect(within(thirdCard).getByLabelText('护照号码')).toHaveAttribute('aria-invalid', 'true');
  const [selfScope, , thirdScope] = form.runtime.bind(scope);
  await act(async () => {
    fireEvent.click(within(secondCard).getByRole('button', { name: '删除成员' }));
    await form.runtime.flush();
  });

  expect(form.runtime.snapshot()).toEqual({ insureds: [self, third] });
  expect(form.runtime.bind(scope).map(({ id }) => id)).toEqual([selfScope?.id, thirdScope?.id]);
  const [, remainingFamilyCard] = screen.getAllByRole('region', { name: '成员' });
  if (!remainingFamilyCard) throw new Error('Expected the surviving family card');
  const passport = within(remainingFamilyCard).getByLabelText('护照号码');
  expect(passport).toHaveValue(third.passportNumber);
  expect(passport).toHaveAttribute('aria-invalid', 'true');
});
