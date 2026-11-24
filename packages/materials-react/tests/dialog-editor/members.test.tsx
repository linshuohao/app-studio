import { beforeEach, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { setup, ref } from '../fixtures.js';
import { memberDefinition, memberData } from '../member-definition.js';
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
it('keeps an open editor attached to its member after moving and removes its portal on delete', async () => {
  const form = setup({ material: 'section' }, '', undefined, true, {
    definition: memberDefinition,
    initial: memberData,
    profile: 'compact',
    strict: true,
  });
  fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[1]!);
  const modal = screen.getByRole('dialog', { name: '编辑成员' });
  fireEvent.change(within(modal).getByRole('textbox', { name: '成员姓名' }), {
    target: { value: '乙已编辑' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: '移到首位' }));
  await act(() => form.runtime.flush());
  expect(screen.getByRole('dialog')).toBe(modal);
  expect(within(modal).getByRole('textbox', { name: '成员姓名' })).toHaveValue('乙已编辑');
  expect(form.runtime.read(ref('/insureds/0/name'))).toEqual({ kind: 'value', value: '乙已编辑' });
  const oldInput = within(modal).getByRole('textbox', { name: '成员姓名' });
  fireEvent.click(within(modal).getByRole('button', { name: '删除成员' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.change(oldInput, { target: { value: '迟到编辑' } });
  expect(form.runtime.read(ref('/insureds/0/name'))).toEqual({ kind: 'value', value: '甲' });
  expect(screen.getAllByRole('button', { name: '编辑' })).toHaveLength(1);
});
it('switches Profiles on the same Runtime, preserves edits and retains hidden-field rules', async () => {
  const form = setup({ material: 'section' }, '', undefined, true, {
    definition: memberDefinition,
    initial: memberData,
    profile: 'compact',
  });
  fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!);
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByRole('textbox', { name: '成员姓名' }), {
    target: { value: '跨视图姓名' },
  });
  fireEvent.change(within(dialog).getByRole('textbox', { name: '监护人姓名' }), {
    target: { value: '' },
  });
  const snapshot = form.runtime.snapshot();
  form.switchProfile('desktop');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(form.runtime.snapshot()).toBe(snapshot);
  expect(screen.getAllByRole('textbox', { name: '成员姓名' })[0]).toHaveValue('跨视图姓名');
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/showGuardian'), value: false });
  });
  expect(screen.queryByRole('textbox', { name: '监护人姓名' })).not.toBeInTheDocument();
  await act(async () => {
    expect((await form.runtime.validate()).status).toBe('invalid');
  });
  form.switchProfile('compact');
  fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!);
  expect(within(screen.getByRole('dialog')).getByRole('textbox', { name: '成员姓名' })).toHaveValue(
    '跨视图姓名',
  );
  await act(() => form.runtime.flush());
});
it('adds independent template instances without mutating existing members', () => {
  const form = setup({ material: 'section' }, '', undefined, true, {
    definition: memberDefinition,
    initial: memberData,
    profile: 'desktop',
  });
  fireEvent.click(screen.getByRole('button', { name: '新增成员' }));
  expect(screen.getAllByRole('textbox', { name: '成员姓名' })).toHaveLength(3);
  const rows = screen.getAllByRole('region', { name: '成员' });
  fireEvent.change(within(rows[0]!).getByRole('textbox', { name: '成员姓名' }), {
    target: { value: '独立成员' },
  });
  expect(form.runtime.read(ref('/insureds/0/name'))).toEqual({ kind: 'value', value: '独立成员' });
  expect(form.runtime.read(ref('/insureds/1/name'))).toEqual({ kind: 'value', value: '甲' });
});
it('closes an old editor after whole-array replacement instead of editing the replacement member', async () => {
  const form = setup({ material: 'section' }, '', undefined, true, {
    definition: memberDefinition,
    initial: memberData,
    profile: 'compact',
  });
  fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0]!);
  const oldInput = within(screen.getByRole('dialog')).getByRole('textbox', { name: '成员姓名' });
  act(() => {
    form.runtime.dispatch({
      op: 'set',
      target: ref('/insureds'),
      value: { $literal: [{ name: '替换成员', age: 30, guardianName: '新监护' }] },
    });
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.change(oldInput, { target: { value: '旧会话写入' } });
  expect(form.runtime.read(ref('/insureds/0/name'))).toEqual({ kind: 'value', value: '替换成员' });
  fireEvent.click(screen.getByRole('button', { name: '编辑' }));
  expect(within(screen.getByRole('dialog')).getByRole('textbox', { name: '成员姓名' })).toHaveValue(
    '替换成员',
  );
  await act(() => form.runtime.flush());
});
