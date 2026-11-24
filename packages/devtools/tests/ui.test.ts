import { afterEach, expect, it, vi } from 'vitest';
import {
  registerObservedProducer,
  getDevtoolsHook,
  emitObservedEvent,
  type ObservationProducer,
  type MetadataValue,
} from '@form-engine/runtime/devtools';
import { observationPageRequest } from '../src/bridge/observation-request.js';
import { mountDevtools } from '../src/ui/mount.js';
import { ObservationStore, foldGraph, neighborhood } from '../src/client/observation-store.js';
const flush = async () => {
  for (let i = 0; i < 100; i++) await Promise.resolve();
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(20);
};
afterEach(() => {
  document.body.replaceChildren();
  Reflect.deleteProperty(globalThis, '__FORM_ENGINE_DEVTOOLS__');
  vi.useRealTimers();
});
it('四视图共用选择、自动推送和步进；断开清空副本并关闭会话', async () => {
  vi.useFakeTimers();
  const owner = {};
  const stop = registerObservedProducer(
    owner,
    (ref) =>
      ({
        ref,
        snapshot: () => ({
          revision: 1,
          rows: [{ record: 'reaction-instance', entityId: 'r', ruleId: 'linked', binding: {} }],
        }),
        revision: () => 1,
        inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
        inspect: () => ({ status: 'unsupported' }),
      }) satisfies ObservationProducer,
  );
  const root = document.createElement('div');
  document.body.append(root);
  const request = vi.fn(async (command: Parameters<typeof observationPageRequest>[0]) =>
    observationPageRequest(command),
  );
  const destroy = mountDevtools(root, {
    request,
    subscribe: (listener) => getDevtoolsHook()!.subscribe(listener),
  });
  await flush();
  expect(root.textContent).toContain('已连接');
  expect(request.mock.calls.filter(([c]) => c.op === 'openObservation')).toHaveLength(1);
  expect([...root.querySelectorAll('nav button')].map((button) => button.textContent)).toEqual([
    '关系',
    '执行',
  ]);
  expect(root.querySelector<HTMLSelectElement>('[aria-label="观测对象"]')!.hidden).toBe(true);
  expect(
    root
      .querySelector('.observer-more')
      ?.contains(
        [...root.querySelectorAll('button')].find((button) => button.textContent === '断开连接')!,
      ),
  ).toBe(true);
  const picker = root.querySelector('select')!;
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(root.querySelector('select')).toBe(picker);
  const node = root.querySelector<SVGGElement>('[aria-label="linked"]')!;
  expect(node).not.toBeNull();
  node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(root.textContent).toContain('entity:r');
  const click = (name: string) => {
    const button = [...root.querySelectorAll('button')].find((b) => b.textContent === name)!;
    expect(button).toBeDefined();
    button.click();
  };
  const stableMain = root.querySelector('main');
  const operationPicker = root.querySelector<HTMLSelectElement>('[aria-label="操作范围"]')!;
  operationPicker.focus();
  const stablePicker = root.querySelector('select');
  emitObservedEvent(owner, 'diagnostic', () => ({ code: 'failure' }));
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(root.querySelector('main')).toBe(stableMain);
  expect(root.querySelector('select')).toBe(stablePicker);
  expect(document.activeElement).toBe(operationPicker);
  operationPicker.blur();
  await flush();
  expect(root.querySelector('main')).not.toBe(stableMain);
  for (const name of ['执行', '状态', '诊断', '关系']) {
    click(name);
    expect(root.textContent).toContain('entity:r');
  }
  click('执行');
  expect(root.querySelector('[aria-label="执行路径图"]')).not.toBeNull();
  click('下一步');
  expect(root.textContent).toContain('1 / 1');
  const calls = request.mock.calls.length;
  await vi.advanceTimersByTimeAsync(31_000);
  await flush();
  expect(request.mock.calls).toHaveLength(calls);
  emitObservedEvent(owner, 'diagnostic', () => ({ code: 'after-idle' }));
  await flush();
  expect(root.textContent).toContain('2 条已保留事实');
  const beforeRecovery = request.mock.calls.filter(([c]) => c.op === 'openObservation').length;
  click('诊断');
  click('查询现场可用性');
  await flush();
  expect(request.mock.calls.filter(([c]) => c.op === 'openObservation')).toHaveLength(
    beforeRecovery + 1,
  );
  expect(root.textContent).not.toContain('session-expired');
  click('断开连接');
  await flush();
  expect(root.textContent).toContain('缓存已清空');
  expect(request.mock.calls.some(([command]) => command.op === 'closeObservation')).toBe(true);
  const opened = request.mock.calls.filter(([c]) => c.op === 'openObservation').length;
  click('重新连接');
  await flush();
  expect(request.mock.calls.filter(([c]) => c.op === 'openObservation')).toHaveLength(opened + 1);
  emitObservedEvent(owner, 'diagnostic', () => ({ code: 'after-reconnect' }));
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(root.textContent).toContain('1 条已保留事实');
  destroy();
  stop();
  expect(root.childNodes).toHaveLength(0);
  await flush();
  expect(vi.getTimerCount()).toBe(0);
});
it('图折叠保留跨成员聚合边，直接上下游与完整链有区别', () => {
  const graph = {
    nodes: [
      { id: 'applicant', label: '投保人', kind: 'object' },
      { id: 'array', label: '被保人', kind: 'array' },
      { id: 'member', label: '成员', kind: 'object', parent: 'array' },
      { id: 'r', label: 'reaction', kind: 'reaction', parent: 'member' },
      { id: 'v', label: 'validator', kind: 'validation', parent: 'member' },
    ],
    edges: [
      { from: 'applicant', to: 'r', kind: 'watch' },
      { from: 'r', to: 'v', kind: 'requires' },
    ],
  };
  const folded = foldGraph(graph, new Set(['array']));
  expect(folded.nodes.map((n) => n.id)).toEqual(['applicant', 'array']);
  expect(folded.edges).toMatchObject([
    { from: 'applicant', to: 'array', kind: 'watch', references: [{ from: 'applicant', to: 'r' }] },
  ]);
  expect(folded.representative('r')).toBe('array');
  expect(neighborhood(graph, 'applicant', false).has('v')).toBe(false);
  expect(neighborhood(graph, 'applicant', true).has('v')).toBe(true);
});
it('工具历史有界且原批次重试幂等，迟到工作不覆盖固定快照状态', () => {
  const store = new ObservationStore(10, 1);
  store.snapshot([{ record: 'validation-source', entityId: 's', status: 'valid' }], 1);
  const events = [1, 2].map((sequence) => ({
    ref: { producerId: 'p', epoch: 'e', sequence },
    kind: 'diagnostic' as const,
    payload: { code: 'old' },
  }));
  store.updates(events, 0);
  store.updates(events, 0);
  expect(store.events).toHaveLength(1);
  expect(store.dropped).toBe(1);
  expect(store.rows[0]!.status).toBe('valid');
  expect(store.stale).toBe(true);
});
it('缺失因果保留占位节点，不能将刷新当前快照当成补回历史', () => {
  const store = new ObservationStore();
  store.updates(
    [
      {
        ref: { producerId: 'p', epoch: 'e', sequence: 2 },
        kind: 'reaction.queued',
        payload: {
          instance: { producerId: 'p', epoch: 'e', entityId: 'r' },
          queueEntryId: 'q',
          cause: { producerId: 'p', epoch: 'e', sequence: 1 },
        },
      },
    ],
    0,
  );
  expect(store.execution().nodes.some((n) => n.kind === 'missing')).toBe(true);
  store.snapshot([], 3);
  expect(store.execution().nodes.some((n) => n.kind === 'missing')).toBe(true);
});

it('完整影响链不沿共同上游折返到旁支，游标重试不重复累计缺失', () => {
  const graph = {
    nodes: [],
    edges: [
      { from: 'a', to: 'b', kind: 'watch' },
      { from: 'a', to: 'c', kind: 'watch' },
      { from: 'b', to: 'd', kind: 'write' },
    ],
  };
  expect([...neighborhood(graph, 'b', true)].sort()).toEqual(['a', 'b', 'd']);
  const store = new ObservationStore();
  store.updates([], 3, 'cut:3');
  store.updates([], 3, 'cut:3');
  expect(store.dropped).toBe(3);
});
it('Data、Context 和字段校验关系不会串线，同名规则按类型选择模板', () => {
  const store = new ObservationStore();
  store.snapshot(
    [
      { record: 'location', id: 'root', path: '', kind: 'object' },
      { record: 'location', id: 'amount', path: '/amount', kind: 'field', parentId: 'root' },
      { record: 'definition', id: 'constraint', ruleId: 'same', kind: 'constraint' },
      { record: 'definition', id: 'reaction', ruleId: 'same', kind: 'reaction' },
      { record: 'reaction-instance', entityId: 'r', ruleId: 'same', binding: {} },
      ...['context', 'validation'].map((source, index): MetadataValue => ({
        record: 'relation',
        id: String(index),
        subject: 'reaction',
        kind: 'watches',
        object: {
          kind: 'reference',
          reference:
            source === 'context'
              ? { source, path: '/amount' }
              : { source, field: { source: 'data', path: '/amount' } },
        },
      })),
    ],
    1,
  );
  const graph = store.relationships();
  expect(
    graph.edges
      .filter((e) => e.kind !== 'contains')
      .map((e) => e.from)
      .sort(),
  ).toEqual(['context:/amount', 'validation-field:amount']);
  expect(graph.edges.filter((e) => e.kind !== 'contains').every((e) => e.to === 'entity:r')).toBe(
    true,
  );
  expect(graph.edges).toContainEqual({
    from: 'location:root',
    to: 'location:amount',
    kind: 'contains',
  });
});

it('多个 Call 共享 Work 时保留调用关联，不跨生产者连接同号 Call', () => {
  const store = new ObservationStore();
  const inputVersion = { dataRevision: 1, contextRevision: 0 };
  const source = { producerId: 'p', epoch: 'e', entityId: 's' };
  store.updates(
    [
      {
        ref: { producerId: 'p', epoch: 'e', sequence: 1 },
        kind: 'call.started',
        payload: { callId: 1, operation: null, inputVersion },
      },
      {
        ref: { producerId: 'p', epoch: 'e', sequence: 2 },
        kind: 'call.started',
        payload: { callId: 2, operation: null, inputVersion },
      },
      {
        ref: { producerId: 'p', epoch: 'e', sequence: 3 },
        kind: 'call.attached-work',
        payload: {
          callId: 1,
          workId: 5,
          source,
          generation: 1,
          eligibilityGeneration: 1,
          reused: true,
        },
      },
      {
        ref: { producerId: 'p', epoch: 'e', sequence: 4 },
        kind: 'call.attached-work',
        payload: {
          callId: 2,
          workId: 5,
          source,
          generation: 1,
          eligibilityGeneration: 1,
          reused: true,
        },
      },
      {
        ref: { producerId: 'other', epoch: 'e', sequence: 1 },
        kind: 'call.finished',
        payload: { callId: 1, outcome: 'valid', inputVersion },
      },
    ],
    0,
  );
  const edges = store.execution().edges.filter((edge) => edge.kind === 'call');
  expect(edges).toContainEqual({ from: 'p:e:1', to: 'p:e:3', kind: 'call' });
  expect(edges).toContainEqual({ from: 'p:e:2', to: 'p:e:4', kind: 'call' });
  expect(edges).toContainEqual({ from: 'missing-call:other:e:1', to: 'other:e:1', kind: 'call' });
});
it('诊断定位到第二页事件，同时清除无关联的旧实体选择', async () => {
  vi.useFakeTimers();
  const owner = {};
  const stop = registerObservedProducer(owner, (ref) => ({
    ref,
    snapshot: () => ({
      revision: 1,
      rows: [{ record: 'reaction-instance', entityId: 'r', ruleId: 'rule', binding: {} }],
    }),
    revision: () => 1,
    inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
    inspect: () => ({ status: 'unsupported' }),
  }));
  const root = document.createElement('div');
  document.body.append(root);
  const destroy = mountDevtools(root, {
    request: async (command) => observationPageRequest(command),
    subscribe: (listener) => getDevtoolsHook()!.subscribe(listener),
  });
  await flush();

  root.querySelector('svg g')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const click = (label: string) =>
    [...root.querySelectorAll('button')].find((button) => button.textContent === label)!.click();
  for (let index = 0; index < 130; index++)
    emitObservedEvent(owner, 'diagnostic', () => ({ code: `test-${index}` }));
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  click('诊断');
  [...root.querySelectorAll('button')]
    .filter((button) => button.textContent === '定位执行')
    .at(-1)!
    .click();
  expect(root.querySelector('svg g[aria-label="诊断 · test-129"]')).not.toBeNull();
  expect(root.querySelector('.notice')!.textContent).toContain('未选择');
  expect(root.textContent).toContain('2 / 2 页');
  destroy();
  stop();
});
it('40 个成员折叠后保留原始跨对象引用和去重成员数量', () => {
  const graph: {
    nodes: import('../src/client/observation-store.js').GraphNode[];
    edges: import('../src/client/observation-store.js').GraphEdge[];
  } = {
    nodes: [
      { id: 'applicant', kind: 'object', label: '投保人' },
      { id: 'insured', kind: 'array', label: '被保人', memberCount: 40 },
    ],
    edges: [],
  };
  for (let index = 0; index < 40; index++) {
    graph.nodes.push(
      {
        id: `m${index}`,
        kind: 'object',
        label: String(index),
        member: `stable-${index}`,
        parent: 'insured',
      },
      { id: `r${index}`, kind: 'reaction', label: '联动', parent: `m${index}`, status: '完成' },
    );
    graph.edges.push({ from: 'applicant', to: `r${index}`, kind: 'watches' });
  }
  const folded = foldGraph(graph, new Set(['insured']));
  expect(folded.nodes).toHaveLength(2);
  expect(folded.edges).toHaveLength(1);
  expect(folded.edges[0]!.references).toHaveLength(40);
  expect(folded.edges[0]!.memberIds).toHaveLength(40);
  expect(folded.nodes.find((n) => n.id === 'insured')).toMatchObject({ status: '完成 40' });
});
it('下拉框聚焦时延后目录变化，失焦更新选项而不替换控件', async () => {
  vi.useFakeTimers();
  const factory = (
    ref: import('@form-engine/runtime/devtools').ProducerRef,
  ): ObservationProducer => ({
    ref,
    snapshot: () => ({ revision: 1, rows: [] }),
    revision: () => 1,
    inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
    inspect: () => ({ status: 'unsupported' }),
  });
  const stopOne = registerObservedProducer({}, factory);
  const stopInitial = registerObservedProducer({}, factory);
  const root = document.createElement('div');
  document.body.append(root);
  const destroy = mountDevtools(root, {
    request: async (command) => observationPageRequest(command),
    subscribe: (listener) => getDevtoolsHook()!.subscribe(listener),
  });
  await flush();
  const picker = root.querySelector('select')!;
  picker.focus();
  expect(picker.options).toHaveLength(2);
  const stopTwo = registerObservedProducer({}, factory);
  await vi.advanceTimersByTimeAsync(1000);
  await flush();
  expect(root.querySelector('select')).toBe(picker);
  expect(picker.options).toHaveLength(2);
  expect(document.activeElement).toBe(picker);
  picker.blur();
  expect(picker.options).toHaveLength(3);
  expect(root.querySelector('select')).toBe(picker);
  destroy();
  stopTwo();
  stopOne();
  stopInitial();
});

it('Port断开使在途快照失效，不以迟到回复恢复已连接状态', async () => {
  vi.useFakeTimers();
  const stop = registerObservedProducer({}, (ref) => ({
    ref,
    snapshot: () => ({
      revision: 1,
      rows: [{ record: 'reaction-instance', entityId: 'old', ruleId: 'old-epoch', binding: {} }],
    }),
    revision: () => 1,
    inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
    inspect: () => ({ status: 'unsupported' }),
  }));
  let receive!: (push: import('@form-engine/runtime/devtools').ObservationPush) => void;
  let finish!: () => void;
  let pages = 0;
  const root = document.createElement('div');
  document.body.append(root);
  const destroy = mountDevtools(root, {
    subscribe(listener) {
      receive = listener;
      return getDevtoolsHook()!.subscribe(listener);
    },
    request: async (command) => {
      const reply = observationPageRequest(command);
      if (command.op === 'readSnapshotPage') pages++;
      if (command.op === 'readSnapshotPage')
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
      return reply;
    },
  });
  await flush();

  // 在途快照后又排队一次目录刷新；断开也必须取消这份尚未启动的查询。
  const discovery = getDevtoolsHook()!.request({
    version: 2,
    requestId: 'directory',
    op: 'discover',
  }).result;
  if (discovery.status !== 'ok' || !('producers' in discovery)) throw Error('directory');
  receive({ kind: 'directory', producers: discovery.producers, limits: discovery.limits });
  receive({
    kind: 'events',
    events: [
      {
        ref: { ...discovery.producers[0]!.ref, sequence: 1 },
        kind: 'metadata.changed',
        payload: { revision: 2 },
      },
    ],
    dropped: 0,
  });
  receive({ kind: 'status', status: 'disconnected' });
  finish();
  await flush();
  expect(pages).toBe(1);
  expect(root.textContent).toContain('连接不可用：disconnected');
  expect(root.querySelector('[aria-label="old-epoch"]')).toBeNull();
  destroy();
  stop();
  await flush();
});

it('自动切换表单等待关闭时断开，不能重新读取另一个表单', async () => {
  vi.useFakeTimers();
  const factory = (ref: ObservationProducer['ref']): ObservationProducer => ({
    ref,
    snapshot: () => ({ revision: 1, rows: [] }),
    revision: () => 1,
    inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
    inspect: () => ({ status: 'unsupported' }),
  });
  const stopOne = registerObservedProducer({}, factory),
    stopTwo = registerObservedProducer({}, factory);
  const root = document.createElement('div');
  document.body.append(root);
  let receive!: Parameters<
    NonNullable<import('../src/client/observation-client.js').ObservationTransport['subscribe']>
  >[0];
  let finish: (() => void) | undefined,
    hold = true;
  const request = vi.fn(async (command: Parameters<typeof observationPageRequest>[0]) => {
    if (command.op === 'closeObservation' && hold)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    return observationPageRequest(command);
  });
  const destroy = mountDevtools(root, {
    request,
    subscribe(listener) {
      receive = listener;
      return getDevtoolsHook()!.subscribe(listener);
    },
  });
  await flush();
  expect(request.mock.calls.filter(([command]) => command.op === 'openObservation')).toHaveLength(
    1,
  );
  stopOne();
  await flush();
  expect(finish).toBeDefined();
  receive({ kind: 'status', status: 'disconnected' });
  hold = false;
  finish!();
  await flush();
  expect(request.mock.calls.filter(([command]) => command.op === 'openObservation')).toHaveLength(
    1,
  );
  expect(root.textContent).toContain('disconnected');
  destroy();
  stopTwo();
});

it('执行侧边操作按顺序追加，保留选择和焦点，节点显示字段起点', async () => {
  vi.useFakeTimers();
  const owner = {};
  const stop = registerObservedProducer(owner, (ref) => ({
    ref,
    snapshot: () => ({ revision: 1, rows: [] }),
    revision: () => 1,
    inputVersion: () => ({ dataRevision: 0, contextRevision: 0 }),
    inspect: () => ({ status: 'unsupported' }),
  }));
  const root = document.createElement('div');
  document.body.append(root);
  const destroy = mountDevtools(root, {
    request: async (command) => observationPageRequest(command),
    subscribe: (listener) => getDevtoolsHook()!.subscribe(listener),
  });
  await flush();
  const inputVersion = { dataRevision: 1, contextRevision: 0 };
  const first = emitObservedEvent(owner, 'operation.started', () => ({
    source: 'dispatch',
    inputVersion,
  }))!;
  emitObservedEvent(owner, 'data.changed', () => ({
    operation: first,
    commandId: 'c',
    reactionExecutionId: null,
    actionIndex: null,
    target: { path: '/applicant/name' },
    path: '/applicant/name',
    before: inputVersion,
    after: { dataRevision: 2, contextRevision: 0 },
    topologyChanged: false,
    detail: 'target-only',
  }));
  emitObservedEvent(owner, 'operation.started', () => ({ source: 'validate', inputVersion }));
  await flush();
  [...root.querySelectorAll('nav button')]
    .find((button) => button.textContent === '执行')!
    .dispatchEvent(new MouseEvent('click'));
  expect(root.querySelector('select[aria-label="操作范围"]')).toBeNull();
  let tabs = root.querySelectorAll<HTMLButtonElement>('[role=tab]');
  expect(tabs).toHaveLength(3);
  expect(tabs[2]!.getAttribute('aria-selected')).toBe('true');
  expect(tabs[1]!.textContent).toContain('/applicant/name');
  tabs[1]!.focus();
  tabs[1]!.click();
  expect(root.querySelector('svg')?.textContent).toContain('修改 /applicant/name');
  const key = document.activeElement?.getAttribute('data-operation');
  emitObservedEvent(owner, 'operation.started', () => ({ source: 'replaceContext', inputVersion }));
  await flush();
  tabs = root.querySelectorAll<HTMLButtonElement>('[role=tab]');
  expect(tabs).toHaveLength(4);
  expect(tabs[1]!.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement?.getAttribute('data-operation')).toBe(key);
  expect(tabs[3]!.textContent).toContain('更新上下文');
  expect(tabs[3]!.textContent).toContain('最新');
  destroy();
  stop();
});
