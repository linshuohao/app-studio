import { it, expect } from 'vitest';
import { act, screen, fireEvent } from '@testing-library/react';
import { ref, setup } from '../fixtures.js';
it('invalidates the open member buffer when another writer replaces the array, even with identical values', async () => {
  const form = setup(
    {
      material: 'array-editor',
      bindings: { value: ref() },
      props: { title: '仓位', initial: { name: '' } },
    },
    [{ name: 'A' }],
    { type: 'array', items: { type: 'object' } },
  );
  fireEvent.click(screen.getByRole('button', { name: '编辑成员' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'name' }), {
    target: { value: 'old buffer' },
  });
  await act(async () => {
    await form.set([]);
    await form.set([{ name: 'A' }]);
  });
  expect(screen.getByRole('button', { name: '保存成员' })).toBeDisabled();
  expect(form.value()).toEqual({ kind: 'value', value: [{ name: 'A' }] });
});

it('shows an inline setup message when the published array editor has no value binding', () => {
  setup({
    material: 'section',
    props: { title: '成员管理' },
    slots: {
      default: [
        { material: 'array-editor', props: { title: '仓位', initial: { name: '' } } },
        { material: 'value-display', props: { value: '相邻物料仍可显示' } },
      ],
    },
  });
  expect(screen.getByRole('region', { name: '仓位' })).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('请绑定对象数组');
  expect(screen.getByRole('button', { name: '新增成员' })).toBeDisabled();
  expect(screen.getByText('相邻物料仍可显示')).toBeVisible();
});
