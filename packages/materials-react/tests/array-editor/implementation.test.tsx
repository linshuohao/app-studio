import { it, expect } from 'vitest';
import { act, screen, fireEvent, render } from '@testing-library/react';
import { compile } from '@form-engine/compiler';
import { FormRenderer, createMaterialRegistry } from '@form-engine/renderer-react';
import { createRuntime } from '@form-engine/runtime';
import { createArrayEditor } from '../../src/index.js';
import { ref, setup } from '../fixtures.js';
it('invalidates the open member buffer when another writer replaces the array, even with identical values', async () => {
  const form = setup(
    {
      material: 'array-editor',
      bindings: { value: ref() },
      props: { title: '仓位', initial: { name: '' } },
    },
    [{ name: 'A' }],
    { type: 'array', items: { type: 'object' } },
  );
  fireEvent.click(screen.getByRole('button', { name: '编辑成员' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'name' }), {
    target: { value: 'old buffer' },
  });
  await act(async () => {
    await form.set([]);
    await form.set([{ name: 'A' }]);
  });
  expect(screen.getByRole('button', { name: '保存成员' })).toBeDisabled();
  expect(form.value()).toEqual({ kind: 'value', value: [{ name: 'A' }] });
});

it('shows an inline setup message when the published array editor has no value binding', () => {
  setup({
    material: 'section',
    props: { title: '成员管理' },
    slots: {
      default: [
        { material: 'array-editor', props: { title: '仓位', initial: { name: '' } } },
        { material: 'value-display', props: { value: '相邻物料仍可显示' } },
      ],
    },
  });
  expect(screen.getByRole('region', { name: '仓位' })).toBeVisible();
  expect(screen.getByRole('alert')).toHaveTextContent('请绑定对象数组');
  expect(screen.getByRole('button', { name: '新增成员' })).toBeDisabled();
  expect(screen.getByText('相邻物料仍可显示')).toBeVisible();
});

it('discards an open member drawer when the view loses and regains its array binding', () => {
  const artifact = {
    id: 'array-editor-rebind-test',
    platform: 'web',
    digest: `sha256:${'3'.repeat(64)}` as const,
  };
  const material = createArrayEditor(artifact);
  const materials = createMaterialRegistry([material]);
  function prepare(bound: boolean) {
    const result = compile({
      definition: {
        protocolVersion: '1',
        id: 'array-editor-rebind',
        version: '1',
        data: {
          schema: {
            type: 'object',
            properties: { value: { type: 'array', items: { type: 'object' } } },
          },
        },
        views: {
          main: {
            material: 'array-editor',
            props: { title: '仓位', initial: { name: '' } },
            ...(bound ? { bindings: { value: ref() } } : {}),
          },
        },
      },
      catalog: {
        id: 'array-editor-rebind-test',
        materials: { 'array-editor': { manifest: material.contract.manifest, artifact } },
        pureFunctions: {},
      },
    });
    if (!result.success) throw Error(JSON.stringify(result.diagnostics));
    return result.prepared;
  }
  const bound = prepare(true);
  const runtime = createRuntime({ prepared: bound, functions: {}, data: { value: [] } });
  const view = render(<FormRenderer prepared={bound} runtime={runtime} materials={materials} />);
  try {
    fireEvent.click(screen.getByRole('button', { name: '新增成员' }));
    expect(screen.getByRole('button', { name: '保存成员' })).toBeEnabled();
    view.rerender(
      <FormRenderer prepared={prepare(false)} runtime={runtime} materials={materials} />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('请绑定对象数组');
    expect(screen.queryByRole('button', { name: '保存成员' })).not.toBeInTheDocument();
    view.rerender(<FormRenderer prepared={bound} runtime={runtime} materials={materials} />);
    expect(screen.getByRole('button', { name: '新增成员' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '保存成员' })).not.toBeInTheDocument();
    expect(runtime.snapshot()).toEqual({ value: [] });
  } finally {
    view.unmount();
    runtime.dispose();
  }
});
