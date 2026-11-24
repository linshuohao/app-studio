import { StrictMode } from 'react';
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { FormRenderer } from '../src/index.js';
import { materials, setup } from './fixtures.js';
// 本测试验证真实 React 与生命周期目录接缝；公开 Hook 与扩展 E2E 另行验证。
import { observedDescendants } from '../../runtime/src/devtools/observation-lifecycle.js';
const budget = {
  definition: { maxRows: 5000, maxVisits: 100000, maxDepth: 64, maxTextBytes: 1000000 },
  topology: { maxNodes: 10000, maxDepth: 64, maxTextBytes: 1000000 },
  maxRows: 10000,
  maxBytes: 2000000,
};
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
});
it('真实 StrictMode 挂载目录包含 view/material，读取不重新求值，重挂和销毁释放旧生产者', async () => {
  const form = setup();
  const mount = () =>
    render(
      <StrictMode>
        <FormRenderer {...form} materials={materials} />
      </StrictMode>,
    );
  const first = mount();
  await act(() => form.runtime.flush());
  const producers = observedDescendants(form.runtime, budget);
  expect(producers).toHaveLength(2);
  const snapshot = () =>
    producers.flatMap((producer) => {
      const result = producer.snapshot();
      if ('status' in result) throw Error(result.status);
      return result.rows;
    });
  const before = snapshot();
  expect(before).toContainEqual(
    expect.objectContaining({ record: 'renderer-view', lifecycle: 'active' }),
  );
  expect(before).toContainEqual(
    expect.objectContaining({
      record: 'renderer-material',
      lifecycle: 'active',
      bindings: expect.arrayContaining([expect.objectContaining({ valueState: 'value' })]),
    }),
  );
  expect(JSON.stringify(before)).not.toContain('Alice');
  const traces = form.runtime.diagnostics().length;
  expect(snapshot()).toEqual(before);
  expect(form.runtime.diagnostics()).toHaveLength(traces);
  first.unmount();
  expect(observedDescendants(form.runtime, budget)).toHaveLength(0);
  expect(producers.every((producer) => 'status' in producer.snapshot())).toBe(true);
  const second = mount();
  await act(() => form.runtime.flush());
  const next = observedDescendants(form.runtime, budget);
  expect(next).toHaveLength(2);
  expect(
    next.every((producer) => producers.every((old) => old.ref.epoch !== producer.ref.epoch)),
  ).toBe(true);
  await act(() => form.runtime.dispose());
  expect(next.every((producer) => 'status' in producer.snapshot())).toBe(true);
  expect(observedDescendants(form.runtime, budget)).toHaveLength(0);
  second.unmount();
});
it('同一 Runtime 的两个 Renderer 互不撤销，卸载一个只移除所属子树', async () => {
  const form = setup();
  const one = render(<FormRenderer {...form} materials={materials} />);
  const two = render(<FormRenderer {...form} materials={materials} />);
  await act(() => form.runtime.flush());
  const all = observedDescendants(form.runtime, budget);
  expect(all).toHaveLength(4);
  one.unmount();
  const remaining = observedDescendants(form.runtime, budget);
  expect(remaining).toHaveLength(2);
  expect(remaining.every((producer) => !('status' in producer.snapshot()))).toBe(true);
  two.unmount();
  form.runtime.dispose();
});
