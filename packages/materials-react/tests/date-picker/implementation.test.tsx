import { expect, it } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { field, setup } from '../fixtures.js';

it('displays Host dates, rejects typing into the trigger and clears from the popup', async () => {
  const form = setup(field('date-picker'), '2028-02-29');
  const trigger = screen.getByRole('button', { name: '测试字段' });
  expect(screen.queryByRole('textbox', { name: '测试字段' })).not.toBeInTheDocument();
  expect(trigger).toHaveTextContent('2028-02-29');
  await form.set('2027-02-29');
  expect(trigger).toHaveAttribute('aria-invalid', 'true');
  await form.set('2028-03-10');
  expect(trigger).toHaveTextContent('2028-03-10');
  fireEvent.click(trigger);
  fireEvent.click(await screen.findByRole('button', { name: '清空日期' }));
  expect(form.runtime.snapshot()).toEqual({ value: null });
});

it('commits a calendar choice immediately through the form binding', async () => {
  const form = setup(field('date-picker'), '2028-02-28');
  fireEvent.click(screen.getByRole('button', { name: '测试字段' }));
  const grid = await screen.findByRole('grid');
  const day = grid.querySelector('[data-day="2028-02-29"] button');
  expect(day).toBeEnabled();
  if (day) fireEvent.click(day);
  expect(form.runtime.snapshot()).toEqual({ value: '2028-02-29' });
});

it('jumps to a typed year while keeping keyboard focus in the calendar', async () => {
  setup(field('date-picker'), '2028-02-28');
  fireEvent.click(screen.getByRole('button', { name: '测试字段' }));
  const grid = await screen.findByRole('grid');
  const year = screen.getByRole('textbox', { name: '年份' });
  year.focus();
  fireEvent.change(year, { target: { value: '1990' } });
  fireEvent.keyDown(year, { key: 'Enter' });
  expect(year).toHaveFocus();
  expect(grid.querySelector('[data-day="1990-02-28"] button')).toBeEnabled();
});
