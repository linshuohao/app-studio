import { expect, it } from 'vitest';
import { act, screen } from '@testing-library/react';
import { setup, ref } from '../fixtures.js';
it('reads member fields and supplied premium without computing or changing them', async () => {
  const form = setup(
    { material: 'insured-summary', props: { premiumMinor: 500 }, bindings: { insured: ref() } },
    { name: '张三', age: 0 },
    {
      type: 'object',
      properties: { name: { type: 'string' }, age: { type: 'integer', minimum: 0 } },
    },
  );
  expect(screen.getByRole('heading', { name: '张三' })).toBeVisible();
  expect(screen.getByText('0')).toBeVisible();
  expect(screen.getByText('¥5.00')).toBeVisible();
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
  await form.set({ name: '', age: '-' });
  await act(() => form.runtime.flush());
  expect(screen.getByRole('heading', { name: '未填写姓名' })).toBeVisible();
  expect(screen.getByRole('list', { name: '成员问题' })).toBeVisible();
  expect(screen.getByText('¥5.00')).toBeVisible();
  expect(form.value()).toEqual({ kind: 'value', value: { name: '', age: '-' } });
});
it('does not stringify malformed objects or interpret missing data as a valid member', () => {
  const form = setup(
    {
      material: 'insured-summary',
      props: { premiumMinor: null, emptyName: '待填写' },
      bindings: { insured: ref() },
    },
    { name: { private: 'secret' }, age: {} },
    { type: 'object' },
  );
  expect(screen.getByRole('heading', { name: '待填写' })).toBeVisible();
  expect(form.container).not.toHaveTextContent('secret');
  expect(form.container).not.toHaveTextContent('[object Object]');
});
