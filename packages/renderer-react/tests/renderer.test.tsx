import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FormRenderer, createMaterialRegistry } from '../src/index.js';
import { data, definitions, materials, setup } from './fixtures.js';
afterEach(cleanup);
it('真实编译视图首读、普通输入和 Host 修改沿同一 Runtime 更新，卸载不销毁实例', async () => {
  const { prepared, runtime } = setup();
  const page = render(<FormRenderer prepared={prepared} runtime={runtime} materials={materials} />);
  expect(screen.getByRole('textbox')).toHaveValue('Alice');
  const values: unknown[] = [];
  const observer = runtime.observe([data('/name')], () => values.push(runtime.read(data('/name'))));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Bob' } });
  expect(runtime.read(data('/name'))).toEqual({ kind: 'value', value: 'Bob' });
  expect(values).toHaveLength(1);
  await act(async () => {
    runtime.dispatch({ op: 'set', target: data('/name'), value: 'Host' });
    await runtime.flush();
  });
  expect(screen.getByRole('textbox')).toHaveValue('Host');
  page.unmount();
  expect(runtime.isScopeAlive()).toBe(true);
  observer.dispose();
  runtime.dispose();
});
it('缺失物料只降级相应位置，确定注册拒绝重复身份', async () => {
  const form = setup(
    {
      material: 'box',
      slots: {
        default: [
          { material: 'input', bindings: { value: data('/name') } },
          { material: 'absent' },
        ],
      },
    },
    { extraMaterials: [{ id: 'absent', version: '1' }] },
  );
  render(<FormRenderer {...form} materials={materials} />);
  expect(screen.getByRole('textbox')).toHaveValue('Alice');
  expect(screen.getByRole('alert')).toHaveTextContent('暂时不可用');
  expect(() => createMaterialRegistry([definitions[0]!, definitions[0]!])).toThrow('duplicate');
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});

it('物料声明但页面未绑定的位置以 missing 呈现，不伪造读错误', async () => {
  const form = setup({ material: 'input' });
  render(<FormRenderer {...form} materials={materials} />);
  expect(screen.getByRole('textbox')).toHaveValue('');
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});
