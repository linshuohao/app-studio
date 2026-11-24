import { expect, it } from 'vitest';
import { act, fireEvent, screen } from '@testing-library/react';
import type { ViewNode } from '@form-engine/protocol/definition';
import { setup, ref } from '../fixtures.js';
type Option = { id: string; label: string };
type Input = { query: string; filterKey: string | null };
function remoteForm(options: { disabled?: boolean; clearable?: boolean; strict?: boolean } = {}) {
  const queue: Array<{
    input: Input;
    signal: AbortSignal;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  const view: ViewNode = {
    material: 'field',
    props: { label: '目的地城市' },
    bindings: { value: ref() },
    slots: {
      default: [
        {
          material: 'remote-select',
          props: {
            filterKey: { $expr: { ref: ref('/country') } },
            disabled: options.disabled ?? false,
            clearable: options.clearable ?? true,
          },
          bindings: { value: ref() },
          requests: { search: { type: 'host.request', request: 'lookup' } },
        },
      ],
    },
  };
  const form = setup(
    {
      material: 'condition',
      props: { visible: { $expr: { ref: ref('/show') } } },
      slots: { default: [view] },
    },
    null,
    true,
    true,
    {
      strict: options.strict,
      definition: {
        data: {
          schema: {
            type: 'object',
            properties: {
              value: {
                anyOf: [
                  {
                    type: 'object',
                    required: ['id', 'label'],
                    properties: { id: { type: 'string' }, label: { type: 'string' } },
                    additionalProperties: false,
                  },
                  { type: 'null' },
                ],
              },
              country: { type: ['string', 'null'] },
              show: { type: 'boolean' },
            },
          },
        },
      },
      initial: { value: { id: 'original', label: '原城市' }, country: 'CN', show: true },
      requests: {
        lookup: (input, { signal }) =>
          new Promise((resolve, reject) =>
            queue.push({ input: input as Input, signal, resolve, reject }),
          ),
      },
    },
  );
  const search = (text: string) => {
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: text } });
    fireEvent.click(screen.getByRole('button', { name: '搜索' }));
  };
  const succeed = async (index: number, items: Option[]) => {
    await act(async () => {
      queue[index]!.resolve({ items });
      await Promise.resolve();
    });
  };
  return { ...form, queue, search, succeed };
}
it('searches without writing, selects the complete option and clears only on explicit action', async () => {
  const form = remoteForm();
  form.search('杭州');
  expect(form.queue[0]!.input).toEqual({ query: '杭州', filterKey: 'CN' });
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
  expect((await form.runtime.validate()).status).toBe('valid');
  await form.succeed(0, [{ id: 'HZ', label: '杭州市' }]);
  fireEvent.click(screen.getByRole('button', { name: '杭州市' }));
  expect(form.value()).toEqual({ kind: 'value', value: { id: 'HZ', label: '杭州市' } });
  fireEvent.click(screen.getByRole('button', { name: '清空选择' }));
  expect(form.value()).toEqual({ kind: 'value', value: null });
});
it('cancels on query changes and ignores a late success or rejection', async () => {
  const form = remoteForm();
  form.search('A');
  form.search('B');
  expect(form.queue[0]!.signal.aborted).toBe(true);
  await form.succeed(1, [{ id: 'B', label: '新结果 B' }]);
  await form.succeed(0, [{ id: 'A', label: '旧结果 A' }]);
  expect(screen.queryByRole('button', { name: '旧结果 A' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '新结果 B' })).toBeVisible();
  form.search('C');
  form.search('D');
  await act(async () => {
    form.queue[2]!.reject(Error('late private failure'));
    await Promise.resolve();
  });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('clears completed candidates on filter changes without changing the selected business value', async () => {
  const form = remoteForm();
  form.search('same');
  await form.succeed(0, [{ id: 'old', label: '旧候选' }]);
  const old = screen.getByRole('button', { name: '旧候选' });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/country'), value: 'US' });
  });
  expect(screen.queryByRole('button', { name: '旧候选' })).not.toBeInTheDocument();
  fireEvent.click(old);
  expect(form.value()).toEqual({ kind: 'value', value: { id: 'original', label: '原城市' } });
  expect(form.queue).toHaveLength(1);
});
it('rejects an already queued result after A→B→A filter changes', async () => {
  const form = remoteForm();
  form.search('same');
  await act(async () => {
    form.queue[0]!.resolve({ items: [{ id: 'old', label: '旧调用' }] });
    form.runtime.dispatch({ op: 'set', target: ref('/country'), value: 'US' });
    await Promise.resolve();
  });
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/country'), value: 'CN' });
  });
  expect(screen.queryByRole('button', { name: '旧调用' })).not.toBeInTheDocument();
});
it('reports technical failures without clearing the selected option or publishing a business Issue', async () => {
  const form = remoteForm();
  form.search('bad');
  await act(async () => {
    form.queue[0]!.reject(Error('private detail'));
    await Promise.resolve();
  });
  expect(screen.getByRole('alert')).toHaveTextContent('搜索暂时无法完成');
  expect(screen.getByRole('alert')).not.toHaveTextContent('private detail');
  expect(form.value()).toEqual({ kind: 'value', value: { id: 'original', label: '原城市' } });
  expect(form.runtime.getValidation(ref()).issues).toHaveLength(0);
  form.search('invalid');
  await act(async () => {
    form.queue[1]!.resolve({ items: 'wrong' });
    await Promise.resolve();
  });
  expect(screen.getByRole('alert')).toHaveTextContent('搜索暂时无法完成');
});
it('cancels pending calls on parent hiding and never restores old candidates after remount', async () => {
  const form = remoteForm();
  form.search('late');
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: false });
  });
  expect(form.queue[0]!.signal.aborted).toBe(true);
  await form.succeed(0, [{ id: 'late', label: '销毁后结果' }]);
  act(() => {
    form.runtime.dispatch({ op: 'set', target: ref('/show'), value: true });
  });
  expect(screen.queryByRole('button', { name: '销毁后结果' })).not.toBeInTheDocument();
  expect(form.value()).toEqual({ kind: 'value', value: { id: 'original', label: '原城市' } });
});
it('replaces a repeated identical query and supports empty results without clearing the selection', async () => {
  const form = remoteForm({ strict: true });
  form.search('same');
  form.search('same');
  expect(form.queue[0]!.signal.aborted).toBe(true);
  await form.succeed(1, []);
  await form.succeed(0, [{ id: 'late', label: '旧结果' }]);
  expect(screen.queryByRole('button', { name: '旧结果' })).not.toBeInTheDocument();
  expect(screen.getByText('未找到选项')).toBeVisible();
  expect(form.value()).toEqual({ kind: 'value', value: { id: 'original', label: '原城市' } });
});
it('treats explicit cancellation as discarded and cancels again on actual unmount', async () => {
  const form = remoteForm();
  form.search('cancel');
  fireEvent.click(screen.getByRole('button', { name: '取消搜索' }));
  expect(form.queue[0]!.signal.aborted).toBe(true);
  await form.succeed(0, [{ id: 'late', label: '已取消结果' }]);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '已取消结果' })).not.toBeInTheDocument();
  form.search('unmount');
  form.unmount();
  expect(form.queue[1]!.signal.aborted).toBe(true);
  await form.succeed(1, [{ id: 'unmounted', label: '卸载后结果' }]);
  expect(form.value()).toEqual({ kind: 'value', value: { id: 'original', label: '原城市' } });
});
it('does not search or clear through a disabled, non-clearable control', () => {
  const form = remoteForm({ disabled: true, clearable: false });
  expect(screen.getByRole('searchbox')).toBeDisabled();
  expect(screen.queryByRole('button', { name: '清空选择' })).not.toBeInTheDocument();
  form.search('disabled');
  expect(form.queue).toHaveLength(0);
  expect(form.runtime.dispatch).not.toHaveBeenCalled();
});

it('reports initial, pending, candidates, selected, empty and error states without writing on search', async () => {
  const form = remoteForm();
  fireEvent.click(screen.getByRole('button', { name: '清空选择' }));
  expect(screen.getByText('输入关键词后搜索')).toBeVisible();
  form.search('杭州');
  expect(screen.getByText('搜索中')).toBeVisible();
  await form.succeed(0, [{ id: 'HZ', label: '杭州市' }]);
  expect(screen.getByText('找到 1 个选项，请选择')).toBeVisible();
  expect(form.value()).toEqual({ kind: 'value', value: null });
  fireEvent.click(screen.getByRole('button', { name: '杭州市' }));
  expect(screen.getByText('已选择，可重新搜索或清空选择')).toBeVisible();
  form.search('无匹配');
  await form.succeed(1, []);
  expect(screen.getByText('未找到选项')).toBeVisible();
  form.search('失败');
  await act(async () => {
    form.queue[2]!.reject(new Error('offline'));
    await Promise.resolve();
  });
  expect(screen.getByText('搜索失败，请重试')).toBeVisible();
  expect(form.value()).toEqual({ kind: 'value', value: { id: 'HZ', label: '杭州市' } });
});

it('does not suggest clearing when clearable is false', () => {
  remoteForm({ clearable: false });
  expect(screen.getByText('已选择，可重新搜索')).toBeVisible();
  expect(screen.queryByRole('button', { name: '清空选择' })).not.toBeInTheDocument();
});
