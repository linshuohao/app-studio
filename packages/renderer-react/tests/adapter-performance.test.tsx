import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  FormRenderer,
  createMaterialRegistry,
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '../src/index.js';
import type { AdapterActionResult } from '../src/adapter/types.js';
import * as json from '../src/material/json.js';
import * as sharedJson from '@form-engine/protocol/internal/json';
import { artifact, data, definitions, materials, setup } from './fixtures.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('业务编辑不重新计算静态物料契约摘要，界面和 Runtime 同步更新', async () => {
  const form = setup();
  const page = render(<FormRenderer {...form} materials={materials} />);
  await act(() => form.runtime.flush());
  const digest = vi.spyOn(json, 'digest');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bob' } });
  await act(() => form.runtime.flush());
  expect(screen.getByRole('textbox')).toHaveValue('Bob');
  expect(form.runtime.read(data('/name')).value).toBe('Bob');
  expect(digest).not.toHaveBeenCalled();
  page.unmount();
  form.runtime.dispose();
});

it('对象 set 只捕获一次外部输入，整链两次复制且非法输入仍在原边界失败', async () => {
  const contract = defineMaterialContract<object, 'value'>({
    id: 'capture',
    version: '1',
    bindings: { value: { schema: true } },
  });
  const payload = { reviewMarker: 'payload', items: [{ value: 1 }] };
  let captures = 0;
  const input = new Proxy(payload, {
    getOwnPropertyDescriptor(target, key) {
      if (key === 'reviewMarker') captures++;
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const results: AdapterActionResult[] = [];
  function Capture() {
    const adapter = useMaterialAdapter(contract);
    return (
      <>
        <button onClick={() => results.push(adapter.set('value', input))}>write object</button>
        <button onClick={() => results.push(adapter.set('value', { bad: undefined } as never))}>
          write invalid
        </button>
      </>
    );
  }
  const form = setup(
    { material: 'capture', bindings: { value: data('/name') } },
    { extraMaterials: [contract.manifest] },
  );
  const page = render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Capture),
      ])}
    />,
  );
  await act(() => form.runtime.flush());
  const runtimeCopy = vi.spyOn(sharedJson, 'copyJson');
  fireEvent.click(screen.getByRole('button', { name: 'write object' }));
  expect(results[0]).toMatchObject({ kind: 'executed', result: { ok: true, changed: true } });
  expect(captures).toBe(1);
  expect(
    runtimeCopy.mock.calls.filter(([value]) => {
      const input = value as {
        reviewMarker?: string;
        value?: { $literal?: { reviewMarker?: string } };
      };
      return (
        input?.reviewMarker === 'payload' || input?.value?.$literal?.reviewMarker === 'payload'
      );
    }),
  ).toHaveLength(2);
  payload.items[0]!.value = 9;
  expect(form.runtime.read(data('/name')).value).toEqual({
    reviewMarker: 'payload',
    items: [{ value: 1 }],
  });
  const snapshot = form.runtime.snapshot();
  fireEvent.click(screen.getByRole('button', { name: 'write invalid' }));
  expect(results[1]).toMatchObject({ kind: 'error' });
  expect(form.runtime.snapshot()).toBe(snapshot);
  await act(() => form.runtime.flush());
  page.unmount();
  form.runtime.dispose();
});
