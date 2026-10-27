import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  FormRenderer,
  createMaterialRegistry,
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
  type RendererDiagnostic,
} from '../src/index.js';
import { artifact, data, definitions, setup } from './fixtures.js';
import { ExpressionProjection } from '../src/adapter/expressions.js';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('表达式求值失败的报告保留 Runtime 提供的具体原因', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const contract = defineMaterialContract<{ value: number }>({
    id: 'expression-error',
    version: '1',
  });
  function Material() {
    return <output>{useMaterialAdapter(contract).props.value}</output>;
  }
  const form = setup(
    {
      material: contract.manifest.id,
      props: { value: { $expr: { op: 'core.div', args: [{ ref: data('/count') }, 0] } } },
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
          defineMaterial(contract, artifact, Material),
        ])}
        onDiagnostic={(entry) => {
          reports.push(entry);
        }}
      />,
    );
    expect(screen.getByRole('alert')).toBeVisible();
    expect(reports.find((entry) => entry.material === contract.manifest.id)?.message).toContain(
      'division by zero',
    );
    await act(() => form.runtime.flush());
  } finally {
    form.runtime.dispose();
  }
});

it.each(['data', 'context'] as const)(
  'Host 同步重渲染发生在 %s 表达式失效回调前，仍交付最新 Props',
  async (source) => {
    const contract = defineMaterialContract<{ label: string }, 'value'>({
      id: 'consistent-snapshot',
      version: '1',
      bindings: { value: { schema: true } },
    });
    const reference =
      source === 'data' ? data('/name') : { source: 'context' as const, path: '/region' };
    const form = setup(
      {
        material: contract.manifest.id,
        bindings: { value: data('/name') },
        props: { label: { $expr: { ref: reference } } },
      },
      { extraMaterials: [contract.manifest], context: { region: 'CN' } },
    );
    let refresh = () => {};
    // Host 可以先注册；不能要求它排在物料观察者之后才允许同步更新自己的 React 状态。
    const host = form.runtime.observe(source === 'data' ? [data('/name')] : [], () =>
      flushSync(refresh),
    );
    const committed: string[] = [];
    function Material() {
      const adapter = useMaterialAdapter(contract);
      const current = form.runtime.read(reference);
      if (current.kind === 'value' && adapter.props.label !== current.value)
        throw Error('Material received mismatched input versions');
      useLayoutEffect(() => {
        committed.push(adapter.props.label);
      });
      return <output>{adapter.props.label}</output>;
    }
    const materials = createMaterialRegistry([
      ...definitions,
      defineMaterial(contract, artifact, Material),
    ]);
    function Parent() {
      const [tick, setTick] = useState(0);
      refresh = () => setTick((value) => value + 1);
      return (
        <section data-tick={tick}>
          <FormRenderer {...form} materials={materials} />
        </section>
      );
    }
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const page = render(<Parent />);
    try {
      await act(() => form.runtime.flush());
      committed.length = 0;
      await act(async () => {
        if (source === 'data')
          form.runtime.dispatch({ op: 'set', target: data('/name'), value: 'Bob' });
        else form.runtime.replaceContext({ region: 'US' });
        await form.runtime.flush();
      });
      const expected = source === 'data' ? 'Bob' : 'US';
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('status')).toHaveTextContent(expected);
      expect(committed.length).toBeGreaterThan(0);
      expect(committed.every((label) => label === expected)).toBe(true);
    } finally {
      page.unmount();
      host.dispose();
      form.runtime.dispose();
    }
  },
);

it('嵌套 Props 只重算依赖变化的表达式，未变分支与 Literal 保留引用', async () => {
  const contract = defineMaterialContract<{
    sections: [{ label: string }, { count: number }];
    literal: object;
  }>({
    id: 'nested-snapshot',
    version: '1',
  });
  let current: ReturnType<typeof useMaterialAdapter<typeof contract>> | undefined;
  function Material() {
    current = useMaterialAdapter(contract);
    return (
      <output>
        {current.props.sections[0].label}/{current.props.sections[1].count}
      </output>
    );
  }
  const form = setup(
    {
      material: contract.manifest.id,
      props: {
        sections: [
          { label: { $expr: { ref: data('/name') } } },
          { count: { $expr: { ref: data('/count') } } },
        ],
        literal: { $literal: { $expr: { op: 'uninterpreted' } } },
      },
    },
    { extraMaterials: [contract.manifest] },
  );
  const evaluate = vi.fn(form.runtime.evaluate);
  const runtime = { ...form.runtime, evaluate };
  const page = render(
    <FormRenderer
      {...form}
      runtime={runtime}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Material),
      ])}
    />,
  );
  try {
    await act(() => runtime.flush());
    const previous = current!.props;
    evaluate.mockClear();
    await act(async () => {
      runtime.dispatch({ op: 'set', target: data('/flag'), value: false });
      await runtime.flush();
    });
    expect(evaluate).not.toHaveBeenCalled();
    await act(async () => {
      runtime.dispatch({ op: 'set', target: data('/name'), value: 'Bob' });
      await runtime.flush();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Bob/1');
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(current!.props.sections[1]).toBe(previous.sections[1]);
    expect(current!.props.literal).toBe(previous.literal);
    expect(current!.props.literal).toEqual({ $expr: { op: 'uninterpreted' } });
  } finally {
    page.unmount();
    runtime.dispose();
  }
});

it('结构 watch 复用成员内容变化的结果，插入成员时重新求值', () => {
  const expression = { op: 'core.length', args: [{ ref: data('/rows') }] };
  const form = setup({ material: 'box', props: { length: { $expr: expression } } });
  const evaluate = vi.fn(form.runtime.evaluate);
  const projection = new ExpressionProjection(
    { $expr: expression, watch: [{ ...data('/rows'), aspect: 'structure' }] },
    { ...form.runtime, evaluate },
    {},
  );
  try {
    expect(projection.read()).toBe(2);
    form.runtime.dispatch({ op: 'set', target: data('/rows/0/name'), value: 'changed' });
    expect(projection.read()).toBe(2);
    expect(evaluate).toHaveBeenCalledTimes(1);
    form.runtime.dispatch({
      op: 'array.insert',
      target: data('/rows'),
      position: { kind: 'index', index: 0 },
      value: { name: 'new' },
    });
    expect(projection.read()).toBe(3);
    expect(evaluate).toHaveBeenCalledTimes(2);
  } finally {
    form.runtime.dispose();
  }
});

it('表达式缓存按 Object.is 区分负零与正零', () => {
  const form = setup();
  const projection = new ExpressionProjection(
    { $expr: { ref: data('/count') }, watch: [data('/count')] },
    form.runtime,
    {},
  );
  try {
    form.runtime.dispatch({ op: 'set', target: data('/count'), value: -0 });
    expect(Object.is(projection.read(), -0)).toBe(true);
    form.runtime.dispatch({ op: 'set', target: data('/count'), value: 0 });
    expect(Object.is(projection.read(), 0)).toBe(true);
  } finally {
    form.runtime.dispose();
  }
});

it.each([null, 'CN', 7, true])('显式替换同值标量 Context %j 仍刷新全部动态表达式', (context) => {
  const form = setup(undefined, { context });
  const evaluate = vi.fn(form.runtime.evaluate);
  const projection = new ExpressionProjection(
    {
      constant: { $expr: { literal: 'stable' }, watch: [] },
      name: { $expr: { ref: data('/name') }, watch: [data('/name')] },
    },
    { ...form.runtime, evaluate },
    {},
  );
  const disposers = projection.connect(() => {
    projection.read();
  });
  try {
    expect(projection.read()).toEqual({ constant: 'stable', name: 'Alice' });
    evaluate.mockClear();
    form.runtime.replaceContext(context);
    expect(projection.read()).toEqual({ constant: 'stable', name: 'Alice' });
    expect(evaluate).toHaveBeenCalledTimes(2);
  } finally {
    disposers.forEach((dispose) => dispose());
    form.runtime.dispose();
  }
});
