import { expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { field, setup } from '../fixtures.js';

it('commits valid typed dates on Enter and blur and keeps invalid text local', async () => {
  const form = setup(field('date-picker'), null);
  const input = screen.getByRole('textbox', { name: '测试字段' });
  fireEvent.change(input, { target: { value: '2028-02-29' } });
  expect(form.runtime.snapshot()).toEqual({ value: null });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(form.runtime.snapshot()).toEqual({ value: '2028-02-29' });
  fireEvent.change(input, { target: { value: '2027-02-29' } });
  fireEvent.blur(input);
  expect(input).toHaveValue('2027-02-29');
  expect(input).toHaveAttribute('aria-invalid', 'true');
  expect(form.runtime.snapshot()).toEqual({ value: '2028-02-29' });
  await form.set('2028-03-10');
  expect(input).toHaveValue('2028-03-10');
  fireEvent.change(input, { target: { value: '' } });
  fireEvent.blur(input);
  expect(form.runtime.snapshot()).toEqual({ value: null });
});

it('commits a calendar choice immediately through the form binding', async () => {
  const form = setup(field('date-picker'), '2028-02-28');
  fireEvent.click(screen.getByRole('button', { name: '打开日期日历' }));
  const grid = await screen.findByRole('grid');
  const day = grid.querySelector('[data-day="2028-02-29"] button');
  expect(day).toBeEnabled();
  if (day) fireEvent.click(day);
  expect(form.runtime.snapshot()).toEqual({ value: '2028-02-29' });
});

it('jumps to a typed year while keeping keyboard focus in the calendar', async () => {
  setup(field('date-picker'), '2028-02-28');
  fireEvent.click(screen.getByRole('button', { name: '打开日期日历' }));
  const grid = await screen.findByRole('grid');
  const year = screen.getByRole('textbox', { name: '年份' });
  year.focus();
  fireEvent.change(year, { target: { value: '1990' } });
  fireEvent.keyDown(year, { key: 'Enter' });
  expect(year).toHaveFocus();
  expect(grid.querySelector('[data-day="1990-02-28"] button')).toBeEnabled();
});
