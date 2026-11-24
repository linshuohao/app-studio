import { expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import { setup, field } from '../fixtures.js';
it('preserves whitespace and clears to a string with one binding write per change', async () => {
  const form = setup(field('text-input'), 'Alice', { type: ['string', 'null'] });
  const input = screen.getByRole('textbox', { name: /测试字段/ });
  fireEvent.change(input, { target: { value: ' 张三 ' } });
  expect(form.value()).toEqual({ kind: 'value', value: ' 张三 ' });
  expect(form.runtime.dispatch).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: '' } });
  expect(form.value()).toEqual({ kind: 'value', value: '' });
  await act(() => form.runtime.flush());
});
it('holds IME text locally, commits once and does not overwrite a Host update', async () => {
  const form = setup(field('text-input'), 'A');
  const input = screen.getByRole('textbox', { name: /测试字段/ });
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '中' } });
  expect(form.value()).toEqual({ kind: 'value', value: 'A' });
  fireEvent.compositionEnd(input, { data: '中', target: { value: '中' } });
  fireEvent.change(input, { target: { value: '中' } });
  expect(form.value()).toEqual({ kind: 'value', value: '中' });
  expect(form.runtime.dispatch).toHaveBeenCalledTimes(1);
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '旧草稿' } });
  await form.set('Host');
  fireEvent.compositionEnd(input, { data: '旧草稿', target: { value: '旧草稿' } });
  fireEvent.blur(input);
  expect(form.value()).toEqual({ kind: 'value', value: 'Host' });
  expect(input).toHaveValue('Host');
});
it('does not initialize missing data or write disabled/readOnly controls', () => {
  const form = setup(
    field('text-input', { readOnly: true, maxLength: 10 }),
    '',
    { type: ['string', 'null'] },
    false,
  );
  expect(screen.getByRole('textbox')).toHaveAttribute('readonly');
  expect(form.value().kind).toBe('missing');
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
it('shows a failed write without replacing the current Runtime value', () => {
  const form = setup(field('text-input'), 'original');
  form.runtime.dispatch.mockReturnValueOnce({
    ok: false,
    changed: false,
    errors: ['test failure'],
  });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'rejected' } });
  expect(form.value()).toEqual({ kind: 'value', value: 'original' });
  expect(screen.getByRole('textbox')).toHaveValue('original');
  expect(screen.getByRole('alert')).toHaveTextContent('本次操作未完成');
});
it('allows a later real edit with the same text as a cancelled IME draft', async () => {
  const form = setup(field('text-input'), 'A');
  const input = screen.getByRole('textbox');
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: '旧草稿' } });
  await form.set('Host');
  fireEvent.compositionEnd(input, { target: { value: '旧草稿' } });
  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.change(input, { target: { value: '旧草稿' } });
  expect(form.value()).toEqual({ kind: 'value', value: '旧草稿' });
});
