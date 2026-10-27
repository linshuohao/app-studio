import { StrictMode } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  FormRenderer,
  createMaterialRegistry,
  defineMaterial,
  defineMaterialContract,
} from '../src/index.js';
import type { RendererDiagnostic } from '../src/diagnostics/types.js';
import { artifact, data, definitions, materials, setup } from './fixtures.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const thrownValues = [
  { label: 'null', value: null, message: 'null' },
  { label: 'undefined', value: undefined, message: 'undefined' },
  { label: 'false', value: false, message: 'false' },
  { label: 'zero', value: 0, message: '0' },
  { label: 'empty string', value: '', message: '' },
  {
    label: 'null-prototype object',
    value: Object.create(null) as object,
    message: 'Unknown render error',
  },
  {
    label: 'throwing conversion',
    value: {
      [Symbol.toPrimitive]() {
        throw Error('cannot stringify');
      },
    },
    message: 'Unknown render error',
  },
];
it.each(thrownValues)(
  '物料抛出 $label 仍局部降级、报告且保留相邻输入',
  async ({ value, message }) => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const contract = defineMaterialContract({ id: 'bad', version: '1' });
    function Bad(): never {
      throw value;
    }
    const form = setup(
      {
        material: 'box',
        slots: {
          default: [{ material: 'input', bindings: { value: data('/name') } }, { material: 'bad' }],
        },
      },
      { extraMaterials: [contract.manifest] },
    );
    const reports: RendererDiagnostic[] = [];
    try {
      render(
        <FormRenderer
          {...form}
          materials={createMaterialRegistry([
            ...definitions,
            defineMaterial(contract, artifact, Bad),
          ])}
          onDiagnostic={(entry) => reports.push(entry)}
        />,
      );
      expect(screen.getByRole('alert')).toHaveTextContent('暂时不可用');
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'still usable' } });
      expect(form.runtime.read(data('/name')).value).toBe('still usable');
      expect(reports).toContainEqual(
        expect.objectContaining({ material: 'bad', phase: 'render', message }),
      );
      await act(() => form.runtime.flush());
    } finally {
      form.runtime.dispose();
    }
  },
);

it('根装配入口抛出 null 时也能展示降级并交付诊断', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const form = setup(),
    reports: RendererDiagnostic[] = [];
  const runtime = {
    ...form.runtime,
    checkView: () => {
      throw null;
    },
  };
  try {
    render(
      <FormRenderer
        {...form}
        runtime={runtime}
        materials={materials}
        onDiagnostic={(entry) => reports.push(entry)}
      />,
    );
    expect(screen.getByRole('alert')).toBeVisible();
    expect(reports).toContainEqual(
      expect.objectContaining({ code: 'RENDERER_UNAVAILABLE', message: 'null' }),
    );
    await act(() => form.runtime.flush());
  } finally {
    form.runtime.dispose();
  }
});

it.each([false, true])('静态装配和挂载错误分别完整交付一次，StrictMode=%s', async (strict) => {
  const form = setup({ material: 'absent' }, { extraMaterials: [{ id: 'absent', version: '1' }] });
  const reports: RendererDiagnostic[] = [];
  try {
    const tree = (
      <FormRenderer {...form} materials={materials} onDiagnostic={(entry) => reports.push(entry)} />
    );
    render(strict ? <StrictMode>{tree}</StrictMode> : tree);
    await act(() => form.runtime.flush());
    expect(reports.filter((entry) => entry.scope === undefined)).toHaveLength(1);
    expect(reports.filter((entry) => entry.scope !== undefined)).toHaveLength(1);
    expect(screen.getByRole('alert')).toBeVisible();
  } finally {
    form.runtime.dispose();
  }
});

it('更换呈现或 Host 回调不重报旧错误，新装配关联仍交付当前错误', async () => {
  const form = setup({ material: 'absent' }, { extraMaterials: [{ id: 'absent', version: '1' }] });
  const first: RendererDiagnostic[] = [],
    second: RendererDiagnostic[] = [];
  const onDiagnostic = (entry: RendererDiagnostic) => {
    first.push(entry);
  };
  const nextDiagnostic = (entry: RendererDiagnostic) => {
    second.push(entry);
  };
  try {
    const page = render(
      <FormRenderer
        {...form}
        materials={materials}
        onDiagnostic={onDiagnostic}
        renderMaterialError={() => <p>first</p>}
      />,
    );
    await act(() => form.runtime.flush());
    expect(first).toHaveLength(2);
    page.rerender(
      <FormRenderer
        {...form}
        materials={materials}
        onDiagnostic={onDiagnostic}
        renderMaterialError={() => <p>second</p>}
      />,
    );
    expect(screen.getByText('second')).toBeVisible();
    expect(first).toHaveLength(2);
    page.rerender(<FormRenderer {...form} materials={materials} onDiagnostic={nextDiagnostic} />);
    expect(second).toHaveLength(0);
    page.rerender(
      <FormRenderer {...form} materials={{ ...materials }} onDiagnostic={nextDiagnostic} />,
    );
    expect(second.filter((entry) => entry.scope === undefined)).toHaveLength(1);
    expect(second.filter((entry) => entry.scope !== undefined)).toHaveLength(1);
    await act(() => form.runtime.flush());
  } finally {
    form.runtime.dispose();
  }
});

it('相同声明的不同 Scope 各自上报，新增成员不重报已有成员', async () => {
  const form = setup(
    { scope: { from: data('/rows'), as: 'row', mode: 'each' }, node: { material: 'absent' } },
    { extraMaterials: [{ id: 'absent', version: '1' }] },
  );
  const reports: RendererDiagnostic[] = [];
  try {
    render(
      <StrictMode>
        <FormRenderer
          {...form}
          materials={materials}
          onDiagnostic={(entry) => reports.push(entry)}
        />
      </StrictMode>,
    );
    await act(() => form.runtime.flush());
    expect(reports.filter((entry) => entry.scope !== undefined)).toHaveLength(2);
    await act(async () => {
      form.runtime.dispatch({
        op: 'array.insert',
        target: data('/rows'),
        position: { kind: 'index', index: 2 },
        value: { name: 'C' },
      });
      await form.runtime.flush();
    });
    expect(screen.getAllByRole('alert')).toHaveLength(3);
    const mounted = reports.filter((entry) => entry.scope !== undefined);
    expect(mounted).toHaveLength(3);
    expect(new Set(mounted.map((entry) => entry.scope!.row!.member)).size).toBe(3);
    expect(reports.filter((entry) => entry.scope === undefined)).toHaveLength(1);
  } finally {
    form.runtime.dispose();
  }
});

it('错误恢复后再出现及真实重挂分别产生新的挂载诊断', async () => {
  const contract = defineMaterialContract({ id: 'absent', version: '1' });
  const form = setup({ material: 'absent' }, { extraMaterials: [contract.manifest] });
  const reports: RendererDiagnostic[] = [];
  const onDiagnostic = (entry: RendererDiagnostic) => {
    reports.push(entry);
  };
  try {
    const page = render(
      <FormRenderer {...form} materials={materials} onDiagnostic={onDiagnostic} />,
    );
    expect(reports.filter((entry) => entry.scope !== undefined)).toHaveLength(1);
    page.rerender(
      <FormRenderer
        {...form}
        materials={createMaterialRegistry([
          ...definitions,
          defineMaterial(contract, artifact, () => <p>available</p>),
        ])}
        onDiagnostic={onDiagnostic}
      />,
    );
    expect(screen.getByText('available')).toBeVisible();
    page.rerender(<FormRenderer {...form} materials={materials} onDiagnostic={onDiagnostic} />);
    expect(reports.filter((entry) => entry.scope !== undefined)).toHaveLength(2);
    page.unmount();
    const next = render(
      <FormRenderer {...form} materials={materials} onDiagnostic={onDiagnostic} />,
    );
    expect(reports.filter((entry) => entry.scope !== undefined)).toHaveLength(3);
    await act(() => form.runtime.flush());
    next.unmount();
  } finally {
    form.runtime.dispose();
  }
});

it('同一挂载的诊断内容变化会交付，Scope 字典顺序变化不重报', async () => {
  const { MaterialFallback } = await import('../src/diagnostics/material-fallback.js');
  const entries: RendererDiagnostic[] = [];
  const report = (entry: RendererDiagnostic) => {
    entries.push(entry);
  };
  const diagnostic: RendererDiagnostic = {
    code: 'MATERIAL_UNAVAILABLE',
    phase: 'assembly',
    formId: 'form',
    profile: 'main',
    nodeId: 'node',
    occurrence: 'root',
    material: 'input',
    message: 'first',
    scope: { a: { path: '' }, b: { path: '/rows' } },
  };
  const page = render(<MaterialFallback diagnostic={diagnostic} report={report} />);
  page.rerender(
    <MaterialFallback
      diagnostic={{ ...diagnostic, scope: { b: { path: '/rows' }, a: { path: '' } } }}
      report={report}
    />,
  );
  expect(entries).toHaveLength(1);
  page.rerender(
    <MaterialFallback diagnostic={{ ...diagnostic, message: 'changed' }} report={report} />,
  );
  expect(entries).toHaveLength(2);
  expect(entries[1]?.message).toBe('changed');
});
