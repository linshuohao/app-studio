import { beforeEach, expect, it } from 'vitest';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { setup, ref } from '../fixtures.js';
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
function dateForm(bounds: { startMin?: string; startMax?: string } = {}) {
  return setup(
    {
      material: 'date-range',
      props: { label: '出行日期', ...bounds },
      bindings: { start: ref('/start'), end: ref('/end') },
    },
    null,
    true,
    true,
    {
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: { start: { type: ['string', 'null'] }, end: { type: ['string', 'null'] } },
          },
        },
      },
      initial: { start: '2028-02-28', end: '2028-03-01' },
    },
  );
}
const open = () => {
  fireEvent.click(screen.getByRole('button', { name: '选择日期' }));
  return screen.getByRole('dialog', { name: '出行日期' });
};
function dateTrigger(modal: HTMLElement, name: '开始日期' | '结束日期') {
  return within(modal).getByRole('button', { name: `打开${name}日历` });
}
async function chooseDate(modal: HTMLElement, name: '开始日期' | '结束日期', value: string) {
  fireEvent.click(dateTrigger(modal, name));
  const grid = await within(modal).findByRole('grid');
  const selector = `[data-day="${value}"] button`;
  if (!grid.querySelector(selector)) {
    const calendarYear = within(modal).getByRole('textbox', { name: '年份' });
    fireEvent.change(calendarYear, { target: { value: value.slice(0, 4) } });
    fireEvent.keyDown(calendarYear, { key: 'Enter' });
    const month = grid.closest('.fe-calendar')?.querySelector('select');
    expect(month).toBeInTheDocument();
    fireEvent.change(month!, { target: { value: String(Number(value.slice(5, 7)) - 1) } });
  }
  const day = grid.querySelector(selector);
  expect(day).toBeEnabled();
  fireEvent.click(day!);
}
async function clearDate(modal: HTMLElement, name: '开始日期' | '结束日期') {
  fireEvent.click(dateTrigger(modal, name));
  fireEvent.click(await within(modal).findByRole('button', { name: '清空日期' }));
}
it('refuses a Host date with a trailing newline', () => {
  const form = dateForm();
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/start'), value: '2028-02-29\n' });
  });
  form.runtime.dispatch.mockClear();
  const modal = open();
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(screen.getByRole('dialog', { name: '出行日期' })).toBeVisible();
  expect(dateTrigger(modal, '开始日期')).toHaveAttribute('aria-invalid', 'true');
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
it('holds both drafts until confirmation and cancels without writing', async () => {
  const form = dateForm(),
    modal = open();
  await chooseDate(modal, '开始日期', '2028-03-10');
  fireEvent.click(within(modal).getByRole('button', { name: '取消日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-02-28', end: '2028-03-01' });
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
it.each(['2027-02-29', '0000-01-01', '10000-01-01', '2028-2-29', '2028-04-31', ' 2028-02-29'])(
  'preserves invalid Host value %j and refuses all writes',
  (text) => {
    const form = dateForm();
    act(() => {
      form.runtime.dispatch({ op: 'set', target: ref('/start'), value: text });
    });
    form.runtime.dispatch.mockClear();
    const modal = open();
    const start = dateTrigger(modal, '开始日期');
    fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
    expect(screen.getByRole('dialog', { name: '出行日期' })).toBeVisible();
    expect(form.runtime.snapshot()).toMatchObject({ start: text });
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(form.runtime.dispatch).not.toHaveBeenCalled();
  },
);
it('accepts leap days, null clearing and reversed endpoints without enforcing business range rules', async () => {
  const form = dateForm(),
    modal = open();
  await chooseDate(modal, '开始日期', '2028-03-02');
  await chooseDate(modal, '结束日期', '2028-02-29');
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-03-02', end: '2028-02-29' });
  expect(form.runtime.dispatch).toHaveBeenCalledTimes(2);
  const next = open();
  await clearDate(next, '开始日期');
  await clearDate(next, '结束日期');
  fireEvent.click(within(next).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: null, end: null });
});
it('resets the complete draft when Host changes either endpoint and asks for reconfirmation', async () => {
  const form = dateForm(),
    modal = open();
  await chooseDate(modal, '开始日期', '2028-03-20');
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/end'), value: '2028-04-01' });
  });
  expect(dateTrigger(modal, '开始日期')).toHaveTextContent('2028-02-28');
  expect(dateTrigger(modal, '结束日期')).toHaveTextContent('2028-04-01');
  expect(within(modal).getByRole('status')).toHaveTextContent('重新确认');
});
it('reports a partial write and rereads actual endpoints after the second set fails', async () => {
  const form = dateForm(),
    modal = open();
  const dispatch = form.runtime.dispatch.getMockImplementation()!;
  form.runtime.dispatch
    .mockImplementationOnce(dispatch)
    .mockReturnValueOnce({ ok: false, changed: false, errors: ['failed end'] });
  await chooseDate(modal, '开始日期', '2028-03-02');
  await chooseDate(modal, '结束日期', '2028-03-03');
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(screen.getByRole('dialog', { name: '出行日期' })).toBeVisible();
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-03-02', end: '2028-03-01' });
  expect(within(modal).getByRole('alert')).toHaveTextContent('结束日期未能更新');
  expect(dateTrigger(modal, '结束日期')).toHaveTextContent('2028-03-01');
});
it('does not attempt the second write when the first one fails', () => {
  const form = dateForm(),
    modal = open();
  form.runtime.dispatch.mockReturnValueOnce({
    ok: false,
    changed: false,
    errors: ['failed start'],
  });
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.dispatch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('dialog', { name: '出行日期' })).toBeVisible();
  expect(within(modal).getByRole('alert')).toHaveTextContent('开始日期未能更新');
});
it('accepts the exact first and last Gregorian years', () => {
  const form = dateForm();
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/start'), value: '0001-01-01' });
    form.runtime.dispatch({ op: 'set', target: ref('/end'), value: '9999-12-31' });
  });
  const modal = open();
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '0001-01-01', end: '9999-12-31' });
});
it('handles a real unwritable second parent without rolling back the committed start', async () => {
  const form = setup(
    {
      material: 'date-range',
      props: { label: '出行日期' },
      bindings: { start: ref('/start'), end: ref('/endState/end') },
    },
    null,
    true,
    true,
    {
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: {
              start: { type: ['string', 'null'] },
              endState: { type: 'object', properties: { end: { type: ['string', 'null'] } } },
            },
          },
        },
      },
      initial: { start: '2028-02-28', endState: null },
    },
  );
  const modal = open();
  await chooseDate(modal, '开始日期', '2028-03-02');
  await chooseDate(modal, '结束日期', '2028-03-03');
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-03-02', endState: null });
  expect(within(modal).getByRole('alert')).toHaveTextContent('开始日期已更新');
  expect(dateTrigger(modal, '结束日期')).toHaveTextContent('选择日期');
  expect(form.runtime.dispatch).toHaveBeenCalledTimes(2);
});
it('cleans an unconfirmed draft and its portal when its parent hides', async () => {
  const form = setup(
    {
      material: 'condition',
      props: { visible: { $expr: { ref: ref('/show') } } },
      slots: {
        default: [
          {
            material: 'date-range',
            props: { label: '出行日期' },
            bindings: { start: ref('/start'), end: ref('/end') },
          },
        ],
      },
    },
    null,
    true,
    true,
    {
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: {
              start: { type: ['string', 'null'] },
              end: { type: ['string', 'null'] },
              show: { type: 'boolean' },
            },
          },
        },
      },
      initial: { start: '2028-02-28', end: '2028-03-01', show: true },
    },
  );
  const modal = open();
  await chooseDate(modal, '开始日期', '2028-03-20');
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: false });
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(form.runtime.read(ref('/start'))).toEqual({ kind: 'value', value: '2028-02-28' });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: true });
  });
  expect(dateTrigger(open(), '开始日期')).toHaveTextContent('2028-02-28');
});

it('disables out-of-range days and keeps confirmation in the outer dialog', async () => {
  const form = dateForm({ startMin: '2028-02-28', startMax: '2028-02-29' });
  const modal = open();
  const control = dateTrigger(modal, '开始日期');
  expect(within(modal).queryByRole('textbox', { name: '开始日期' })).not.toBeInTheDocument();
  fireEvent.click(control);
  const popup = await within(modal).findByRole('dialog', { name: '开始日期日历' });
  const grid = within(popup).getByRole('grid');
  expect(grid.querySelector('[data-day="2028-02-27"] button')).toBeDisabled();
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
  fireEvent.click(grid.querySelector('[data-day="2028-02-29"] button')!);
  expect(control).toHaveAttribute('aria-expanded', 'false');
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-02-28' });
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-02-29', end: '2028-03-01' });
});
