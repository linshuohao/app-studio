import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import { FormRenderer } from '../src/index.js';
import * as json from '../src/material/json.js';
import { materials, setup } from './fixtures.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it.each([
  null,
  {},
  [],
  { definition: null, build: { profile: 'main' } },
  { definition: { id: 'x' }, build: null },
])('非法产物 %j 在根边界内降级并上报', async (malformed) => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const form = setup();
  const reports: unknown[] = [];
  try {
    render(
      <FormRenderer
        prepared={malformed as unknown as PreparedForm}
        runtime={form.runtime}
        materials={materials}
        onDiagnostic={(entry) => reports.push(entry)}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('暂时不可用');
    expect(reports).toContainEqual(expect.objectContaining({ code: 'RENDERER_UNAVAILABLE' }));
    await act(() => form.runtime.flush());
  } finally {
    form.runtime.dispose();
  }
});
it('更换物料 / 请求注册只重建呈现环境，不重新遍历同一 Prepared', async () => {
  const form = setup();
  const copy = vi.spyOn(json, 'copyJson');
  const runtime = { ...form.runtime, checkView: vi.fn(form.runtime.checkView) };
  const page = render(<FormRenderer {...form} runtime={runtime} materials={materials} />);
  expect(copy).not.toHaveBeenCalled();
  expect(runtime.checkView).toHaveBeenCalledTimes(1);
  page.rerender(
    <FormRenderer {...form} runtime={runtime} materials={{ ...materials }} requests={{}} />,
  );
  expect(copy).not.toHaveBeenCalled();
  expect(runtime.checkView).toHaveBeenCalledTimes(1);
  page.rerender(
    <FormRenderer
      {...form}
      runtime={runtime}
      prepared={structuredClone(form.prepared)}
      materials={materials}
    />,
  );
  expect(copy).toHaveBeenCalledTimes(1);
  expect(runtime.checkView).toHaveBeenCalledTimes(2);
  await act(() => form.runtime.flush());
  page.unmount();
  form.runtime.dispose();
});

it('配置的访问器不在根身份读取时执行，错误仍由根边界承接', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const getter = vi.fn(() => {
    throw Error('accessor must not run');
  });
  const malformed = Object.defineProperty({}, 'definition', { get: getter, enumerable: true });
  const form = setup();
  render(
    <FormRenderer
      prepared={malformed as PreparedForm}
      runtime={form.runtime}
      materials={materials}
    />,
  );
  expect(screen.getByRole('alert')).toBeDefined();
  expect(getter).not.toHaveBeenCalled();
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});
it('兼容性缓存不掩盖 Runtime 销毁，后续装配仍拒绝失效实例', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const form = setup();
  const reports: unknown[] = [];
  const page = render(
    <FormRenderer {...form} materials={materials} onDiagnostic={(entry) => reports.push(entry)} />,
  );
  await act(() => form.runtime.flush());
  form.runtime.dispose();
  page.rerender(
    <FormRenderer
      {...form}
      materials={{ ...materials }}
      onDiagnostic={(entry) => reports.push(entry)}
    />,
  );
  expect(screen.getByRole('alert')).toBeDefined();
  expect(reports).toContainEqual(expect.objectContaining({ code: 'RENDERER_UNAVAILABLE' }));
  page.unmount();
});

it('Strict Mode 模拟清理后，晚连接仍能查询最初装配错误', async () => {
  const { StrictMode } = await import('react');
  const { getDevtoolsHook } = await import('@form-engine/runtime/devtools');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const form = setup();
  const malformed = structuredClone(form.prepared) as PreparedForm;
  malformed.definition.data.schema = { type: 'array' };
  const page = render(
    <StrictMode>
      <FormRenderer prepared={malformed} runtime={form.runtime} materials={materials} />
    </StrictMode>,
  );
  const hook = getDevtoolsHook()!;
  const view = hook.list().find((source) => source.kind === 'view')!;
  expect(hook.read(view.id)!.value).toMatchObject({
    diagnostics: [{ code: 'RENDERER_UNAVAILABLE' }],
  });
  page.unmount();
  form.runtime.dispose();
});
