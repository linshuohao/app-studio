import { beforeEach, expect, it } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
it('refuses a Host date with a trailing newline even though a text input normalizes its display', () => {
  const form = dateForm();
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/start'), value: '2028-02-29\n' });
  });
  form.runtime.dispatch.mockClear();
  const modal = open();
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(within(modal).getByRole('textbox', { name: '开始日期' })).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
it('holds both drafts until confirmation and cancels without writing', () => {
  const form = dateForm(),
    modal = open();
  fireEvent.change(within(modal).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '2028-03-10' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: '取消日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-02-28', end: '2028-03-01' });
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
it.each(['2027-02-29', '0000-01-01', '10000-01-01', '2028-2-29', '2028-04-31', ' 2028-02-29'])(
  'preserves invalid draft %j and refuses all writes',
  (text) => {
    const form = dateForm(),
      modal = open();
    const start = within(modal).getByRole('textbox', { name: '开始日期' });
    fireEvent.change(start, { target: { value: text } });
    fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(start).toHaveValue(text);
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(form.runtime.dispatch).not.toHaveBeenCalled();
  },
);
it('accepts leap days, null clearing and reversed endpoints without enforcing business range rules', () => {
  const form = dateForm(),
    modal = open();
  fireEvent.change(within(modal).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '2028-03-02' },
  });
  fireEvent.change(within(modal).getByRole('textbox', { name: '结束日期' }), {
    target: { value: '2028-02-29' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-03-02', end: '2028-02-29' });
  expect(form.runtime.dispatch).toHaveBeenCalledTimes(2);
  const next = open();
  fireEvent.change(within(next).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '' },
  });
  fireEvent.change(within(next).getByRole('textbox', { name: '结束日期' }), {
    target: { value: '' },
  });
  fireEvent.click(within(next).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: null, end: null });
});
it('resets the complete draft when Host changes either endpoint and asks for reconfirmation', () => {
  const form = dateForm(),
    modal = open();
  fireEvent.change(within(modal).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '2028-03-20' },
  });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/end'), value: '2028-04-01' });
  });
  expect(within(modal).getByRole('textbox', { name: '开始日期' })).toHaveValue('2028-02-28');
  expect(within(modal).getByRole('textbox', { name: '结束日期' })).toHaveValue('2028-04-01');
  expect(within(modal).getByRole('status')).toHaveTextContent('重新确认');
});
it('reports a partial write and rereads actual endpoints after the second set fails', () => {
  const form = dateForm(),
    modal = open();
  const dispatch = form.runtime.dispatch.getMockImplementation()!;
  form.runtime.dispatch
    .mockImplementationOnce(dispatch)
    .mockReturnValueOnce({ ok: false, changed: false, errors: ['failed end'] });
  fireEvent.change(within(modal).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '2028-03-02' },
  });
  fireEvent.change(within(modal).getByRole('textbox', { name: '结束日期' }), {
    target: { value: '2028-03-03' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-03-02', end: '2028-03-01' });
  expect(within(modal).getByRole('alert')).toHaveTextContent('结束日期未能更新');
  expect(within(modal).getByRole('textbox', { name: '结束日期' })).toHaveValue('2028-03-01');
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
  expect(screen.getByRole('dialog')).toBeVisible();
  expect(within(modal).getByRole('alert')).toHaveTextContent('开始日期未能更新');
});
it('accepts the exact first and last Gregorian years', () => {
  const form = dateForm(),
    modal = open();
  fireEvent.change(within(modal).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '0001-01-01' },
  });
  fireEvent.change(within(modal).getByRole('textbox', { name: '结束日期' }), {
    target: { value: '9999-12-31' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '0001-01-01', end: '9999-12-31' });
});
it('handles a real unwritable second parent without rolling back the committed start', () => {
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
  fireEvent.change(within(modal).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '2028-03-02' },
  });
  fireEvent.change(within(modal).getByRole('textbox', { name: '结束日期' }), {
    target: { value: '2028-03-03' },
  });
  fireEvent.click(within(modal).getByRole('button', { name: '确认日期' }));
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-03-02', endState: null });
  expect(within(modal).getByRole('alert')).toHaveTextContent('开始日期已更新');
  expect(within(modal).getByRole('textbox', { name: '结束日期' })).toHaveValue('');
  expect(form.runtime.dispatch).toHaveBeenCalledTimes(2);
});
it('cleans an unconfirmed draft and its portal when its parent hides', () => {
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
  fireEvent.change(within(modal).getByRole('textbox', { name: '开始日期' }), {
    target: { value: '2028-03-20' },
  });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: false });
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(form.runtime.read(ref('/start'))).toEqual({ kind: 'value', value: '2028-02-28' });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: true });
  });
  expect(within(open()).getByRole('textbox', { name: '开始日期' })).toHaveValue('2028-02-28');
});

it('applies inclusive bounds to the start picker and rejects out-of-range drafts before writing', () => {
  const form = dateForm({ startMin: '2028-02-28', startMax: '2028-02-29' });
  const modal = open();
  const start = within(modal).getByLabelText('开始日期');
  const confirm = within(modal).getByRole('button', { name: '确认日期' });
  for (const value of ['2028-02-27', '2028-03-01']) {
    fireEvent.change(start, { target: { value } });
    fireEvent.click(confirm);
    expect(start).toHaveAttribute('aria-invalid', 'true');
    expect(form.runtime.dispatch).not.toHaveBeenCalled();
  }
  fireEvent.change(start, { target: { value: '2028-02-29' } });
  fireEvent.click(confirm);
  expect(form.runtime.snapshot()).toMatchObject({ start: '2028-02-29', end: '2028-03-01' });
});

it('opens a calendar for the start date inside the confirmation panel', async () => {
  const form = dateForm();
  const modal = open();
  fireEvent.click(within(modal).getByRole('button', { name: '打开开始日期日历' }));
  await waitFor(() => expect(within(modal).getByRole('grid')).toBeVisible());
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});
