import { listProducers, readMetadata } from './observation.js';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import { StrictMode, useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
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

it('首次读取到注册之间变化不丢失，Strict Mode 和卸载释放所有观察', async () => {
  const form = setup();
  let active = 0,
    changed = false;
  const runtime = {
    ...form.runtime,
    observe: (...args: Parameters<typeof form.runtime.observe>) => {
      active++;
      const observation = form.runtime.observe(...args);
      if (!changed && args[0].some((watch) => watch.source === 'data' && watch.path === '/name')) {
        changed = true;
        form.runtime.dispatch({
          op: 'set',
          target: data('/name'),
          value: 'between-read-and-subscribe',
        });
      }
      let disposed = false;
      return {
        ...observation,
        dispose: () => {
          if (!disposed) {
            disposed = true;
            active--;
            observation.dispose();
          }
        },
      };
    },
  };
  const page = render(
    <StrictMode>
      <FormRenderer prepared={form.prepared} runtime={runtime} materials={materials} />
    </StrictMode>,
  );
  await act(() => runtime.flush());
  expect(screen.getByRole('textbox')).toHaveValue('between-read-and-subscribe');
  page.unmount();
  expect(active).toBe(0);
  form.runtime.dispose();
});

it('隐藏子树释放观察但保留数据，重挂读最新值，父条件继续工作', async () => {
  const contract = defineMaterialContract<{ show: boolean }>({
    id: 'conditional',
    version: '1',
    slots: ['default'],
  });
  function Conditional() {
    const a = useMaterialAdapter(contract);
    return a.props.show ? a.slots.default : null;
  }
  const form = setup(
    {
      material: 'conditional',
      props: { show: { $expr: { ref: data('/flag') } } },
      slots: { default: [{ material: 'input', bindings: { value: data('/name') } }] },
    },
    { extraMaterials: [contract.manifest] },
  );
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Conditional),
      ])}
    />,
  );
  await act(async () => {
    form.runtime.dispatch({ op: 'set', target: data('/flag'), value: false });
    await form.runtime.flush();
  });
  expect(screen.queryByRole('textbox')).toBeNull();
  await act(async () => {
    form.runtime.dispatch({ op: 'set', target: data('/name'), value: 'hidden update' });
    form.runtime.dispatch({ op: 'set', target: data('/flag'), value: true });
    await form.runtime.flush();
  });
  expect(screen.getByRole('textbox')).toHaveValue('hidden update');
  form.runtime.dispose();
});

it('同位置改绑拒绝旧回调，原样 JSON 的保留键不作为配置执行', async () => {
  let captured: ((value: unknown) => unknown) | undefined;
  const contract = defineMaterialContract<object, 'value'>({
    id: 'capture',
    version: '1',
    bindings: { value: { schema: true } },
  });
  function Capture() {
    const a = useMaterialAdapter(contract);
    captured ??= (value) => a.set('value', value as never);
    return (
      <button onClick={() => a.set('value', { $expr: { op: 'should-stay-literal' } })}>
        write literal
      </button>
    );
  }
  const original = setup(
    { material: 'capture', bindings: { value: data('/name') } },
    { extraMaterials: [contract.manifest] },
  );
  const replacement = setup(
    { material: 'capture', bindings: { value: data('/rows/0/name') } },
    { extraMaterials: [contract.manifest] },
  );
  const registry = createMaterialRegistry([
    ...definitions,
    defineMaterial(contract, artifact, Capture),
  ]);
  const page = render(<FormRenderer {...original} materials={registry} />);
  page.rerender(
    <FormRenderer
      prepared={replacement.prepared}
      runtime={original.runtime}
      materials={registry}
    />,
  );
  expect(captured!('late')).toEqual({ kind: 'inactive' });
  fireEvent.click(screen.getByRole('button'));
  expect(original.runtime.read(data('/rows/0/name'))).toEqual({
    kind: 'value',
    value: { $expr: { op: 'should-stay-literal' } },
  });
  expect(original.runtime.read(data('/name'))).toEqual({ kind: 'value', value: 'Alice' });
  await act(() => original.runtime.flush());
  original.runtime.dispose();
  replacement.runtime.dispose();
});

it('确认型交互取消不写，非法数字编辑结束保留 Runtime 工作值', async () => {
  const contract = defineMaterialContract<object, 'value'>({
    id: 'confirm',
    version: '1',
    bindings: { value: { schema: true } },
  });
  function Confirm() {
    const a = useMaterialAdapter(contract),
      [draft, setDraft] = useState('unconfirmed');
    return (
      <>
        <input aria-label="draft" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <button onClick={() => a.set('value', draft)}>confirm</button>
        <button onClick={() => setDraft('')}>cancel</button>
        <output>{a.values.value.kind === 'value' ? String(a.values.value.value) : ''}</output>
      </>
    );
  }
  const form = setup(
    { material: 'confirm', bindings: { value: data('/count') } },
    { extraMaterials: [contract.manifest] },
  );
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Confirm),
      ])}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'cancel' }));
  expect(form.runtime.read(data('/count'))).toEqual({ kind: 'value', value: 1 });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '-' } });
  fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
  await act(() => form.runtime.flush());
  expect(screen.getByRole('status')).toHaveTextContent('-');
  expect(form.runtime.getValidation(data('/count')).status).toBe('invalid');
  form.runtime.dispose();
});

it('配置事件以 Event Payload 发起 Host 通知，完整校验交付对应数据', async () => {
  const seen: unknown[] = [];
  const contract = defineMaterialContract<object, 'value', { save: { selected: string } }>({
    id: 'save',
    version: '1',
    events: {
      save: {
        payloadSchema: {
          type: 'object',
          properties: { selected: { type: 'string' } },
          required: ['selected'],
        },
      },
    },
    bindings: { value: { schema: true } },
  });
  function Save() {
    const a = useMaterialAdapter(contract);
    return <button onClick={() => a.emit('save', { selected: 'payload' })}>Save</button>;
  }
  const form = setup(
    {
      material: 'save',
      bindings: { value: data('/name') },
      on: {
        save: {
          type: 'host.emit',
          event: 'application.save',
          payload: { $expr: { ref: { source: 'event', path: '/selected' } } },
        },
      },
    },
    {
      extraMaterials: [contract.manifest],
      host: {
        events: {
          'application.save': (input) => {
            seen.push(input.payload);
          },
        },
      },
    },
  );
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([...definitions, defineMaterial(contract, artifact, Save)])}
    />,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(seen).toEqual(['payload']);
  const result = await form.runtime.validate();
  expect(result.status).toBe('valid');
  expect(result.snapshot).toMatchObject({ name: 'Alice' });
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});

it('兼容 Profile 切换复用 Runtime，不重放 Reaction 激活', async () => {
  const definition = {
    views: {
      main: { material: 'input', bindings: { value: data('/name') }, props: { label: 'Main' } },
      other: { material: 'input', bindings: { value: data('/name') }, props: { label: 'Other' } },
    },
    reactions: [
      {
        id: 'activation',
        watch: [],
        runOnActivate: true,
        then: [
          {
            op: 'set' as const,
            target: data('/count'),
            value: { $expr: { op: 'core.add', args: [{ ref: data('/count') }, 1] } },
          },
        ],
      },
    ],
  };
  const first = setup(undefined, { definition, profile: 'main' }),
    next = setup(undefined, { definition, profile: 'other' });
  const page = render(<FormRenderer {...first} materials={materials} />);
  await act(() => first.runtime.flush());
  expect(first.runtime.read(data('/count'))).toEqual({ kind: 'value', value: 2 });
  page.rerender(
    <FormRenderer prepared={next.prepared} runtime={first.runtime} materials={materials} />,
  );
  expect(screen.getByRole('textbox', { name: 'Other' })).toHaveValue('Alice');
  await act(() => first.runtime.flush());
  expect(first.runtime.read(data('/count'))).toEqual({ kind: 'value', value: 2 });
  first.runtime.dispose();
  next.runtime.dispose();
});

it('单物料渲染失败局部降级，上报抛错仍不影响相邻输入', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const contract = defineMaterialContract({ id: 'broken', version: '1' });
  function Broken(): never {
    throw Error('private render error');
  }
  const form = setup(
    {
      material: 'box',
      slots: {
        default: [
          { material: 'input', bindings: { value: data('/name') } },
          { material: 'broken' },
        ],
      },
    },
    { extraMaterials: [contract.manifest] },
  );
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Broken),
      ])}
      onDiagnostic={() => {
        throw Error('report failed');
      }}
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('暂时不可用');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'still usable' } });
  expect(form.runtime.read(data('/name'))).toEqual({ kind: 'value', value: 'still usable' });
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});

it('隐藏但已进入 Prepared 的请求缺失在装配时报告，不等待首次挂载', async () => {
  const hidden = defineMaterialContract({
    id: 'hidden',
    version: '1',
    requests: { load: { payloadSchema: { type: 'null' }, resultSchema: true } },
  });
  const condition = defineMaterialContract<{ show: boolean }>({
    id: 'hide-request',
    version: '1',
    slots: ['default'],
  });
  function Condition() {
    const a = useMaterialAdapter(condition);
    return a.props.show ? a.slots.default : null;
  }
  function Hidden() {
    return <div>unused</div>;
  }
  const form = setup(
    {
      material: 'hide-request',
      props: { show: false },
      slots: {
        default: [
          {
            material: 'hidden',
            requests: { load: { type: 'host.request', request: 'missing.lookup' } },
          },
        ],
      },
    },
    { extraMaterials: [hidden.manifest, condition.manifest] },
  );
  const reports: unknown[] = [];
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(hidden, artifact, Hidden),
        defineMaterial(condition, artifact, Condition),
      ])}
      onDiagnostic={(diagnostic) => {
        reports.push(diagnostic);
      }}
    />,
  );
  expect(reports).toContainEqual(
    expect.objectContaining({
      code: 'REQUEST_UNAVAILABLE',
      material: 'hidden',
      request: 'missing.lookup',
    }),
  );
  expect(screen.queryByLabelText('表单接入诊断')).toBeNull();
  expect(document.body).not.toHaveTextContent('missing.lookup');
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});

it('显式替换修复后的物料注册可恢复局部错误边界', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const contract = defineMaterialContract({ id: 'repairable', version: '1' });
  function Broken(): never {
    throw Error('before replacement');
  }
  function Repaired() {
    return <p>repaired</p>;
  }
  const form = setup({ material: 'repairable' }, { extraMaterials: [contract.manifest] });
  const page = render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Broken),
      ])}
    />,
  );
  expect(screen.getByRole('alert')).toBeVisible();
  page.rerender(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Repaired),
      ])}
    />,
  );
  expect(screen.getByText('repaired')).toBeVisible();
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});

it('根装配失败仍登记 DevTools 视图并展示诊断，不要求内部执行体成功提交', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { getDevtoolsHook } = await import('@form-engine/runtime/devtools');
  const form = setup();
  const incompatible = structuredClone(form.prepared) as PreparedForm;
  incompatible.definition.data.schema = { type: 'array' };
  const reports: unknown[] = [];
  const page = render(
    <FormRenderer
      prepared={incompatible}
      runtime={form.runtime}
      materials={materials}
      onDiagnostic={(entry) => reports.push(entry)}
    />,
  );
  expect(screen.getByRole('alert')).toBeVisible();
  const hook = getDevtoolsHook()!;
  const view = listProducers(hook).find((source) => source.kind === 'view')!;
  expect(view).toBeDefined();
  expect(readMetadata(hook, view.ref)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record: 'diagnostic', code: 'RENDERER_UNAVAILABLE' }),
    ]),
  );
  expect(reports).toContainEqual(expect.objectContaining({ code: 'RENDERER_UNAVAILABLE' }));
  page.unmount();
  form.runtime.dispose();
});

it('初次提交超过工具显示容量的物料错误全部交付 Host，上报不静默截断', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const contract = defineMaterialContract({ id: 'many-broken', version: '1' });
  function Broken(): never {
    throw Error('initial failure');
  }
  const form = setup(
    {
      material: 'box',
      slots: { default: Array.from({ length: 101 }, () => ({ material: 'many-broken' })) },
    },
    { extraMaterials: [contract.manifest] },
  );
  const reports: unknown[] = [];
  const page = render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Broken),
      ])}
      onDiagnostic={(entry) => reports.push(entry)}
    />,
  );
  expect(reports).toHaveLength(101);
  await act(() => form.runtime.flush());
  page.unmount();
  form.runtime.dispose();
});

it('工具与呈现读取同一接管的 Prepared，不随 Host 修改原始对象改变树', async () => {
  const { getDevtoolsHook } = await import('@form-engine/runtime/devtools');
  const form = setup({
    material: 'input',
    bindings: { value: data('/name') },
    props: { label: 'Original' },
  });
  const input = structuredClone(form.prepared) as PreparedForm;
  const page = render(
    <FormRenderer prepared={input} runtime={form.runtime} materials={materials} />,
  );
  const root = input.definition.views.main!;
  if (!('material' in root)) throw Error('fixture');
  root.props = { label: 'Changed outside' };
  expect(screen.getByRole('textbox', { name: 'Original' })).toHaveValue('Alice');
  const hook = getDevtoolsHook()!;
  const view = listProducers(hook).find((source) => source.kind === 'view')!;
  expect(readMetadata(hook, view.ref)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record: 'renderer-view', formId: input.definition.id }),
    ]),
  );
  expect(JSON.stringify(readMetadata(hook, view.ref))).not.toContain('Changed outside');
  await act(() => form.runtime.flush());
  page.unmount();
  form.runtime.dispose();
});
