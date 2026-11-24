import { Projection } from '../src/adapter/projection.js';
import { createRenderEnvironment } from '../src/renderer/create-render-environment.js';
import { DiagnosticEmitter } from '../src/diagnostics/emitter.js';
import { listProducers, readMetadata, openSession, request } from './observation.js';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import { getDevtoolsHook } from '@form-engine/runtime/devtools';
import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import {
  FormRenderer,
  createMaterialRegistry,
  defineMaterial,
  defineMaterialContract,
  defineRequest,
  useMaterialAdapter,
  type RequestCall,
  type HostRequestRegistry,
} from '../src/index.js';
import { artifact, definitions, setup } from './fixtures.js';
afterEach(cleanup);
const search = defineRequest<string, string[]>({
  payloadSchema: { type: 'string' },
  resultSchema: { type: 'array', items: { type: 'string' } },
});
function fixture(concurrency: 'latest' | 'parallel' = 'latest') {
  const calls: RequestCall<string[]>[] = [];
  const request = { search: { ...search, concurrency } };
  const contract = defineMaterialContract<object, never, Record<string, never>, typeof request>({
    id: 'search',
    version: '1',
    requests: request,
  });
  function Search() {
    const a = useMaterialAdapter(contract);
    return (
      <button onClick={() => calls.push(a.request('search', `query-${calls.length}`))}>
        Search
      </button>
    );
  }
  const form = setup(
    { material: 'search', requests: { search: { type: 'host.request', request: 'lookup' } } },
    { extraMaterials: [contract.manifest] },
  );
  return {
    ...form,
    calls,
    materials: createMaterialRegistry([...definitions, defineMaterial(contract, artifact, Search)]),
  };
}
function pending() {
  const queue: Array<{
    input: string;
    signal: AbortSignal;
    resolve: (value: string[]) => void;
    reject: (reason: unknown) => void;
  }> = [];
  const requests: HostRequestRegistry = {
    lookup: (input, { signal }) =>
      new Promise<string[]>((resolve, reject) =>
        queue.push({ input: input as string, signal, resolve, reject }),
      ),
  };
  return { requests, queue };
}
it('latest 立即 discarded、取消旧网络，后发先至及旧异常不覆盖有效结果', async () => {
  const form = fixture(),
    host = pending();
  const page = render(<FormRenderer {...form} requests={host.requests} />);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('button'));
  expect(host.queue.map((call) => call.input)).toEqual(['query-0', 'query-1']);
  expect(await form.calls[0]!.result).toEqual({ status: 'discarded' });
  expect(host.queue[0]!.signal.aborted).toBe(true);
  host.queue[1]!.resolve(['new']);
  expect(await form.calls[1]!.result).toEqual({ status: 'success', value: ['new'] });
  host.queue[0]!.reject(Error('late'));
  await act(() => form.runtime.flush());
  page.unmount();
  form.runtime.dispose();
});
it('parallel 独立结果、显式取消及卸载立即结算，不等不可取消的网络', async () => {
  const form = fixture('parallel'),
    host = pending();
  const page = render(<FormRenderer {...form} requests={host.requests} />);
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('button'));
  form.calls[0]!.cancel();
  expect(await form.calls[0]!.result).toEqual({ status: 'discarded' });
  host.queue[1]!.resolve(['second']);
  expect(await form.calls[1]!.result).toEqual({ status: 'success', value: ['second'] });
  fireEvent.click(screen.getByRole('button'));
  page.unmount();
  expect(await form.calls[2]!.result).toEqual({ status: 'discarded' });
  form.runtime.dispose();
});
it('请求契约检查错误输出、同步异常与拒绝；缺失注册装配即局部降级', async () => {
  const form = fixture();
  const page = render(<FormRenderer {...form} requests={{ lookup: () => 42 }} />);
  fireEvent.click(screen.getByRole('button'));
  expect(await form.calls[0]!.result).toMatchObject({
    status: 'error',
    error: { code: 'REQUEST_RESULT_INVALID' },
  });
  page.rerender(
    <FormRenderer
      {...form}
      requests={{
        lookup: () => {
          throw Error('private failure');
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(await form.calls[1]!.result).toMatchObject({
    status: 'error',
    error: { code: 'REQUEST_FAILED' },
  });
  page.rerender(
    <FormRenderer
      {...form}
      requests={{ lookup: () => Promise.reject(Error('private rejection')) }}
    />,
  );
  fireEvent.click(screen.getByRole('button'));
  expect(await form.calls[2]!.result).toMatchObject({
    status: 'error',
    error: { code: 'REQUEST_FAILED' },
  });
  page.rerender(<FormRenderer {...form} />);
  expect(screen.getByRole('alert')).toHaveTextContent('暂时不可用');
  expect(screen.queryByRole('button')).toBeNull();
  await act(() => form.runtime.flush());
  form.runtime.dispose();
});

it('Runtime 销毁时在途物料请求立即 discarded，而不等待网络返回', async () => {
  const form = fixture(),
    host = pending();
  const page = render(<FormRenderer {...form} requests={host.requests} />);
  fireEvent.click(screen.getByRole('button'));
  form.runtime.dispose();
  let settled: unknown;
  void form.calls[0]!.result.then((value) => {
    settled = value;
  });
  await Promise.resolve();
  expect(settled).toEqual({ status: 'discarded' });
  page.unmount();
});

it('模板显式形参与所属成员分开：删除所属成员立即 discarded，其他实例保留', async () => {
  const calls: RequestCall<string[]>[] = [];
  const contract = defineMaterialContract({
    id: 'owned-search',
    version: '1',
    requests: { search },
  });
  function Search() {
    const a = useMaterialAdapter(contract);
    return (
      <button onClick={() => calls.push(a.request('search', 'q') as RequestCall<string[]>)}>
        owned search
      </button>
    );
  }
  const form = setup(
    {
      scope: { from: { source: 'data', path: '/rows' }, as: 'row', mode: 'each' },
      node: { $use: 'global', with: { target: { source: 'data', path: '/name' } } },
    },
    {
      extraMaterials: [contract.manifest],
      definition: {
        viewTemplates: {
          global: {
            params: { target: { schemaRef: '#/properties/name' } },
            node: {
              material: 'owned-search',
              requests: { search: { type: 'host.request', request: 'lookup' } },
            },
          },
        },
      },
    },
  );
  const host = pending();
  render(
    <FormRenderer
      {...form}
      materials={createMaterialRegistry([
        ...definitions,
        defineMaterial(contract, artifact, Search),
      ])}
      requests={host.requests}
    />,
  );
  fireEvent.click(screen.getAllByRole('button')[0]!);
  fireEvent.click(screen.getAllByRole('button')[1]!);
  const scope = form.runtime.bind({
    from: { source: 'data', path: '/rows' },
    as: 'row',
    mode: 'each',
  })[0]!;
  await act(async () => {
    form.runtime.dispatch(
      { op: 'array.remove', target: { source: 'data', path: '/rows' }, item: { $scope: 'row' } },
      scope,
    );
    expect(await calls[0]!.result).toEqual({ status: 'discarded' });
    expect(host.queue[0]!.signal.aborted).toBe(true);
    expect(host.queue[1]!.signal.aborted).toBe(false);
    host.queue[1]!.resolve(['remaining']);
    expect(await calls[1]!.result).toEqual({ status: 'success', value: ['remaining'] });
    await form.runtime.flush();
  });
  form.runtime.dispose();
});

it('诊断 / 业务降级回调变化及 DevTools 断开重连不替换 Projection 或撤销请求', async () => {
  const form = fixture(),
    host = pending();
  const first = () => undefined;
  const page = render(<FormRenderer {...form} requests={host.requests} onDiagnostic={first} />);
  fireEvent.click(screen.getByRole('button'));
  const hook = getDevtoolsHook()!;
  expect(listProducers(hook).some((source) => source.kind === 'material')).toBe(true);
  const producer = listProducers(hook).find((source) => source.kind === 'material')!;
  const firstSession = openSession(hook, producer.ref);
  request(hook, {
    op: 'closeObservation',
    producer: producer.ref,
    sessionId: firstSession.sessionId,
  });
  const again = openSession(hook, producer.ref);
  page.rerender(
    <FormRenderer
      {...form}
      requests={host.requests}
      onDiagnostic={() => undefined}
      renderMaterialError={() => <p>业务提示</p>}
    />,
  );
  expect(host.queue[0]!.signal.aborted).toBe(false);
  host.queue[0]!.resolve(['still current']);
  expect(await form.calls[0]!.result).toEqual({ status: 'success', value: ['still current'] });
  request(hook, { op: 'closeObservation', producer: producer.ref, sessionId: again.sessionId });
  page.unmount();
  form.runtime.dispose();
});

it('开发采集只读缓存，不额外执行 Props 纯函数或注册业务观察，公开请求终态可查询', async () => {
  const form = fixture(),
    host = pending();
  const page = render(<FormRenderer {...form} requests={host.requests} />);
  const hook = getDevtoolsHook()!;
  const source = listProducers(hook).find((source) => source.kind === 'material')!;
  expect(readMetadata(hook, source.ref)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ record: 'renderer-material', requests: [] }),
    ]),
  );
  const session = openSession(hook, source.ref);
  const target = { producer: source.ref, sessionId: session.sessionId };
  fireEvent.click(screen.getByRole('button'));
  expect(readMetadata(hook, source.ref)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        requests: [expect.objectContaining({ name: 'search', status: 'pending' })],
      }),
    ]),
  );
  host.queue[0]!.resolve(['finished']);
  await form.calls[0]!.result;
  expect(readMetadata(hook, source.ref)).toEqual(
    expect.arrayContaining([expect.objectContaining({ requests: [] })]),
  );
  const events = request(hook, { op: 'readUpdates', ...target, cursor: session.cursor });
  if (events.status !== 'ok' || !('events' in events)) throw Error('updates');
  expect(
    events.events
      .filter((event) => event.kind === 'renderer.request')
      .map((event) => event.payload.status),
  ).toEqual(['pending', 'returned', 'success']);
  expect(events.events.find((event) => event.kind === 'renderer.request')).toMatchObject({
    payload: {
      runtime: expect.objectContaining({ producerId: expect.any(String) }),
      view: expect.objectContaining({ producerId: expect.any(String) }),
    },
  });
  expect(JSON.stringify(events.events)).not.toContain('finished');
  request(hook, { op: 'closeObservation', ...target });
  await act(() => form.runtime.flush());
  page.unmount();
  form.runtime.dispose();
  expect(listProducers(hook)).toHaveLength(0);
});

it('Host 原对象的身份字段被外部修改后，回调更新不得重挂视图或取消请求', async () => {
  const form = fixture(),
    host = pending(),
    input = structuredClone(form.prepared) as PreparedForm;
  const page = render(<FormRenderer {...form} prepared={input} requests={host.requests} />);
  fireEvent.click(screen.getByRole('button'));
  input.definition.id = 'external-id';
  input.build.profile = 'external-profile';
  page.rerender(
    <FormRenderer
      {...form}
      prepared={input}
      requests={host.requests}
      onDiagnostic={() => undefined}
    />,
  );
  expect(host.queue[0]!.signal.aborted).toBe(false);
  host.queue[0]!.resolve(['current']);
  expect(await form.calls[0]!.result).toEqual({ status: 'success', value: ['current'] });
  await act(() => form.runtime.flush());
  page.unmount();
  form.runtime.dispose();
});

it('物料内部切换 Hook 消费组件不撤销请求，真实卸载仍立即 discarded', async () => {
  const contract = defineMaterialContract({ id: 'tabs', version: '1', requests: { search } });
  const calls: RequestCall<string[]>[] = [];
  function Client({ label }: { label: string }) {
    const adapter = useMaterialAdapter(contract);
    return <button onClick={() => calls.push(adapter.request('search', label))}>{label}</button>;
  }
  function First() {
    return <Client label="first" />;
  }
  function Second() {
    return <Client label="second" />;
  }
  function Tabs() {
    const [second, setSecond] = useState(false);
    return (
      <>
        <button onClick={() => setSecond(!second)}>switch</button>
        {second ? <Second /> : <First />}
      </>
    );
  }
  const form = setup(
    { material: 'tabs', requests: { search: { type: 'host.request', request: 'lookup' } } },
    { extraMaterials: [contract.manifest] },
  );
  const host = pending();
  const page = render(
    <FormRenderer
      {...form}
      requests={host.requests}
      materials={createMaterialRegistry([...definitions, defineMaterial(contract, artifact, Tabs)])}
    />,
  );
  try {
    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(screen.getByRole('button', { name: 'second' })).toBeVisible();
    expect(host.queue[0]!.signal.aborted).toBe(false);
    host.queue[0]!.resolve(['still mounted']);
    expect(await calls[0]!.result).toEqual({ status: 'success', value: ['still mounted'] });
    fireEvent.click(screen.getByRole('button', { name: 'second' }));
    page.unmount();
    expect(await calls[1]!.result).toEqual({ status: 'discarded' });
    expect(host.queue[1]!.signal.aborted).toBe(true);
  } finally {
    page.unmount();
    form.runtime.dispose();
  }
});

it('显式取消后晚返回或拒绝只上报丢弃事实，不再次交付结果', async () => {
  const form = fixture('parallel'),
    host = pending();
  const page = render(<FormRenderer {...form} requests={host.requests} />);
  const hook = getDevtoolsHook()!,
    producer = listProducers(hook).find((p) => p.kind === 'material')!;
  const session = openSession(hook, producer.ref),
    target = { producer: producer.ref, sessionId: session.sessionId };
  fireEvent.click(screen.getByRole('button'));
  fireEvent.click(screen.getByRole('button'));
  form.calls[0]!.cancel();
  form.calls[1]!.cancel();
  host.queue[0]!.resolve(['secret-result']);
  host.queue[1]!.reject(Error('secret-error'));
  await act(() => form.runtime.flush());
  const updates = request(hook, { op: 'readUpdates', ...target, cursor: session.cursor });
  if (updates.status !== 'ok' || !('events' in updates)) throw Error('updates');
  const facts = updates.events.filter((e) => e.kind === 'renderer.request');
  expect(facts.filter((e) => e.payload.requestId === 1).map((e) => e.payload.status)).toEqual([
    'pending',
    'discarded',
    'returned',
    'late-discarded',
  ]);
  expect(facts.filter((e) => e.payload.requestId === 2).map((e) => e.payload.status)).toEqual([
    'pending',
    'discarded',
    'rejected',
    'late-discarded',
  ]);
  expect(JSON.stringify(updates)).not.toContain('secret-');
  expect(await form.calls[0]!.result).toEqual({ status: 'discarded' });
  expect(await form.calls[1]!.result).toEqual({ status: 'discarded' });
  page.unmount();
  form.runtime.dispose();
});

it('同一 Projection 重启后，旧请求晚返回不污染新挂载代次', async () => {
  const form = fixture('parallel'),
    host = pending();
  const compiled = structuredClone(form.prepared) as unknown as PreparedForm;
  const environment = createRenderEnvironment(
    { compiledForm: compiled, runtime: form.runtime },
    { materials: form.materials, requests: host.requests },
    { compiledForm: compiled, inspectionOwner: {}, diagnostics: new DiagnosticEmitter() },
  );
  const node = compiled.definition.views[compiled.build.profile]!;
  if (!('material' in node)) throw Error('material');
  const projection = new Projection(environment, node, {}, form.materials.search!, 'root', [], {});
  projection.start();
  const old = projection.request('search', 'old');
  projection.stop();
  expect(await old.result).toEqual({ status: 'discarded' });
  projection.start();
  const hook = getDevtoolsHook()!,
    producer = listProducers(hook).find((p) => p.kind === 'material')!;
  const session = openSession(hook, producer.ref),
    target = { producer: producer.ref, sessionId: session.sessionId };
  host.queue[0]!.resolve(['late-old']);
  await Promise.resolve();
  await Promise.resolve();
  const before = request(hook, { op: 'readUpdates', ...target, cursor: session.cursor });
  expect(before).toMatchObject({ events: [] });
  const current = projection.request('search', 'new');
  host.queue[1]!.resolve(['new-result']);
  expect(await current.result).toEqual({ status: 'success', value: ['new-result'] });
  if (before.status !== 'ok' || !('events' in before)) throw Error('events');
  const after = request(hook, { op: 'readUpdates', ...target, cursor: before.nextCursor });
  if (after.status !== 'ok' || !('events' in after)) throw Error('events');
  expect(
    after.events.filter((e) => e.kind === 'renderer.request').map((e) => e.payload.requestId),
  ).toEqual([2, 2, 2]);
  projection.stop();
  form.runtime.dispose();
});

it('停止时 Host abort 同步重启不能遗留旧物料生产者', async () => {
  const form = fixture('parallel'),
    host = pending();
  const compiled = structuredClone(form.prepared) as unknown as PreparedForm;
  const environment = createRenderEnvironment(
    { compiledForm: compiled, runtime: form.runtime },
    { materials: form.materials, requests: host.requests },
    { compiledForm: compiled, inspectionOwner: {}, diagnostics: new DiagnosticEmitter() },
  );
  const node = compiled.definition.views[compiled.build.profile]!;
  if (!('material' in node)) throw Error('material');
  const projection = new Projection(environment, node, {}, form.materials.search!, 'root', [], {});
  projection.start();
  const call = projection.request('search', 'input');
  host.queue[0]!.signal.addEventListener('abort', projection.start);
  projection.stop();
  projection.stop();
  expect(await call.result).toEqual({ status: 'discarded' });
  expect(listProducers(getDevtoolsHook()!).filter((p) => p.kind === 'material')).toEqual([]);
  form.runtime.dispose();
});
