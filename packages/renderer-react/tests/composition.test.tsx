import { getDevtoolsHook } from '@form-engine/runtime/devtools';
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  FormRenderer,
  createMaterialRegistry,
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '../src/index.js';
import { artifact, data, definitions, materials, setup } from './fixtures.js';
afterEach(cleanup);
it('完整表达式独立失效，Context 替换使空 watch 的表达式更新', async () => {
  const contract = defineMaterialContract<{ a: string; b: number; region: string }>({
    id: 'summary',
    version: '1',
  });
  function Summary() {
    const a = useMaterialAdapter(contract);
    return <output>{`${a.props.a}/${a.props.b}/${a.props.region}`}</output>;
  }
  const form = setup(
    {
      material: 'summary',
      props: {
        a: { $expr: { ref: data('/name') } },
        b: { $expr: { ref: data('/count') } },
        region: { $expr: { ref: { source: 'context', path: '/region' } } },
      },
    },
    {
      context: { region: 'CN' },
      extraMaterials: [contract.manifest],
      definition: {/* Context 模型从原定义的表达式使用位置检查 */},
    },
  );
  const evaluated: string[] = [];
  let observations = 0;
  const runtime = {
    ...form.runtime,
    observe: (...args: Parameters<typeof form.runtime.observe>) => {
      observations++;
      return form.runtime.observe(...args);
    },
    evaluate: (...args: Parameters<typeof form.runtime.evaluate>) => {
      evaluated.push(JSON.stringify(args[0]));
      return form.runtime.evaluate(...args);
    },
  };
  render(
    <FormRenderer
      prepared={form.prepared}
      runtime={runtime}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Summary),
      ])}
    />,
  );
  await act(() => runtime.flush());
  const count = evaluated.filter((v) => v.includes('/count')).length;
  const before = { evaluated: evaluated.length, observations };
  const hook = getDevtoolsHook()!;
  for (let i = 0; i < 5; i++) for (const source of hook.list()) hook.read(source.id);
  expect({ evaluated: evaluated.length, observations }).toEqual(before);

  await act(async () => {
    runtime.dispatch({ op: 'set', target: data('/name'), value: 'Bob' });
    await runtime.flush();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Bob/1/CN');
  expect(evaluated.filter((v) => v.includes('/count'))).toHaveLength(count);
  expect(count).toBeGreaterThan(0);
  await act(async () => {
    runtime.replaceContext({ region: 'US' });
    await runtime.flush();
  });
  expect(screen.getByRole('status')).toHaveTextContent('Bob/1/US');
  runtime.dispose();
});
it('each 移动保留物料实例，删除立即使保存的旧回调不可写，整替换重建身份', async () => {
  let mounts = 0;
  const callbacks: Array<(value: string) => unknown> = [];
  const contract = defineMaterialContract<object, 'value'>({
    id: 'row',
    version: '1',
    bindings: { value: { schema: { type: 'string' } } },
  });
  function Row() {
    const a = useMaterialAdapter(contract);
    const [id] = React.useState(() => ++mounts);
    callbacks[id - 1] ??= (value) => a.set('value', value);
    return (
      <input
        aria-label={`row-${id}`}
        value={a.values.value.kind === 'value' ? String(a.values.value.value) : ''}
        onChange={(e) => a.set('value', e.target.value)}
      />
    );
  }
  const form = setup(
    {
      scope: { from: data('/rows'), as: 'row', mode: 'each' },
      node: { material: 'row', bindings: { value: data('/name', 'row') } },
    },
    { extraMaterials: [contract.manifest] },
  );
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([...definitions, defineMaterial(contract, artifact, Row)])}
    />,
  );
  const member = form.runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' })[0]!;
  await act(async () => {
    form.runtime.dispatch(
      {
        op: 'array.move',
        target: data('/rows'),
        item: { $scope: 'row' },
        position: { kind: 'index', index: 1 },
      },
      member,
    );
    await form.runtime.flush();
  });
  expect(screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)).toEqual([
    'B',
    'A',
  ]);
  expect(mounts).toBe(2);
  await act(async () => {
    form.runtime.dispatch(
      { op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } },
      member,
    );
    expect(callbacks[0]!('late')).toEqual({ kind: 'inactive' });
    await form.runtime.flush();
  });
  expect(form.runtime.snapshot()).toMatchObject({ rows: [{ name: 'B' }] });
  await act(async () => {
    form.runtime.dispatch({ op: 'set', target: data('/rows'), value: [{ name: 'B' }] });
    await form.runtime.flush();
  });
  expect(mounts).toBe(3);
  form.runtime.dispose();
});
it('模板参数只绑定明确实参，同模板两处的输入和局部状态独立', async () => {
  const form = setup(
    {
      material: 'box',
      slots: {
        default: [
          { $use: 'field', with: { target: data('/name') } },
          { $use: 'field', with: { target: data('/rows/0/name') } },
        ],
      },
    },
    {
      definition: {
        viewTemplates: {
          field: {
            params: { target: { schemaRef: '#/properties/name' } },
            node: { material: 'input', bindings: { value: data('', 'target') } },
          },
        },
      },
    },
  );
  render(<FormRenderer {...form} materials={materials} />);
  expect(screen.getAllByRole('textbox').map((el) => (el as HTMLInputElement).value)).toEqual([
    'Alice',
    'A',
  ]);
  fireEvent.change(screen.getAllByRole('textbox')[1]!, { target: { value: 'Second' } });
  expect(form.runtime.read(data('/name'))).toEqual({ kind: 'value', value: 'Alice' });
  expect(form.runtime.read(data('/rows/0/name'))).toEqual({ kind: 'value', value: 'Second' });
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});
import * as React from 'react';

it('数组内模板只接收全局参数时仍属于调用方成员，删除后旧回调拒绝', async () => {
  let saved: ((value: string) => unknown) | undefined;
  const contract = defineMaterialContract<object, 'value'>({
    id: 'owned-template',
    version: '1',
    bindings: { value: { schema: { type: 'string' } } },
  });
  function Owned() {
    const a = useMaterialAdapter(contract);
    saved ??= (value) => a.set('value', value);
    return <p>{a.values.value.kind === 'value' ? String(a.values.value.value) : ''}</p>;
  }
  const form = setup(
    {
      scope: { from: data('/rows'), as: 'row', mode: 'each' },
      node: { $use: 'global-field', with: { target: data('/name') } },
    },
    {
      extraMaterials: [contract.manifest],
      definition: {
        viewTemplates: {
          'global-field': {
            params: { target: { schemaRef: '#/properties/name' } },
            node: { material: 'owned-template', bindings: { value: data('', 'target') } },
          },
        },
      },
    },
  );
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Owned),
      ])}
    />,
  );
  const member = form.runtime.bind({ from: data('/rows'), as: 'row', mode: 'each' })[0]!;
  await act(async () => {
    form.runtime.dispatch(
      { op: 'array.remove', target: data('/rows'), item: { $scope: 'row' } },
      member,
    );
    expect(saved!('stale-write')).toEqual({ kind: 'inactive' });
    expect(form.runtime.read(data('/name'))).toEqual({ kind: 'value', value: 'Alice' });
    await form.runtime.flush();
  });
  form.runtime.dispose();
});

it('Binding 投影保留 Object.is 的负零变化和同内容对象替换身份', async () => {
  let seen: unknown;
  const contract = defineMaterialContract<object, 'value'>({
    id: 'identity-read',
    version: '1',
    bindings: { value: { schema: true } },
  });
  function IdentityRead() {
    const a = useMaterialAdapter(contract);
    seen = a.values.value.kind === 'value' ? a.values.value.value : undefined;
    return <output>{Object.is(seen, -0) ? 'negative-zero' : 'other'}</output>;
  }
  const form = setup(
    { material: 'identity-read', bindings: { value: data('/count') } },
    { initial: { count: -0 }, extraMaterials: [contract.manifest] },
  );
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, IdentityRead),
      ])}
    />,
  );
  expect(screen.getByRole('status')).toHaveTextContent('negative-zero');
  act(() => {
    form.runtime.dispatch({ op: 'set', target: data('/count'), value: 0 });
  });
  expect(screen.getByRole('status')).toHaveTextContent('other');
  await act(async () => {
    form.runtime.dispatch({ op: 'set', target: data('/count'), value: { n: 1 } });
    await form.runtime.flush();
  });
  const before = seen;
  await act(async () => {
    form.runtime.dispatch({ op: 'set', target: data('/count'), value: { n: 1 } });
    await form.runtime.flush();
  });
  expect(seen).not.toBe(before);
  expect(seen).toBe(form.runtime.read(data('/count')).value);
  form.runtime.dispose();
});
