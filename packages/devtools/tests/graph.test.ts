import { expect, it } from 'vitest';
import type { ObservationEvent } from '@form-engine/runtime/devtools';
import { ObservationStore, eventKey, foldGraph } from '../src/client/observation-store.js';
import { layoutGraph } from '../src/client/graph-layout.js';
const event = (sequence: number, kind: ObservationEvent['kind'], payload: object) =>
  ({ ref: { producerId: 'runtime', epoch: 'epoch', sequence }, kind, payload }) as ObservationEvent;
it('共享 Work 顺序不传播操作归属或伪造因果', () => {
  const store = new ObservationStore();
  const first = event(1, 'operation.started', {}),
    second = event(6, 'operation.started', {});
  store.updates(
    [
      first,
      event(2, 'call.started', { callId: 1, operation: first.ref }),
      event(3, 'work.created', { workId: 1, causes: [first.ref] }),
      event(4, 'call.attached-work', { callId: 1, workId: 1 }),
      event(5, 'work.started', { workId: 1 }),
      second,
      event(7, 'call.started', { callId: 2, operation: second.ref }),
      event(8, 'call.attached-work', { callId: 2, workId: 1 }),
      event(9, 'work.finished', { workId: 1 }),
    ],
    0,
  );
  store.operation = eventKey(first);
  expect(store.executionEvents().map((e) => e.ref.sequence)).toEqual([1, 2, 3, 4, 5, 9]);
  store.operation = eventKey(second);
  expect(store.executionEvents().map((e) => e.ref.sequence)).toEqual([3, 5, 6, 7, 8, 9]);
  expect(store.actualRelationships().edges.some((e) => e.kind === 'work-order')).toBe(false);
});
it('两次快照之间删除的实例仍保留绑定、历史成员和异常结果', () => {
  const store = new ObservationStore();
  const instance = { producerId: 'runtime', epoch: 'epoch', entityId: 'r1' };
  const row = {
    record: 'reaction-instance',
    entityId: 'r1',
    binding: { person: { member: 'm1', path: '' } },
  };
  store.updates(
    [
      event(1, 'entity.added', { entity: instance, row }),
      event(2, 'reaction.started', { instance, executionId: 'x' }),
      event(3, 'reaction.finished', { instance, executionId: 'x', outcome: 'condition-error' }),
      event(4, 'entity.disposed', { entity: instance, row }),
    ],
    0,
  );
  store.snapshot([], 1);
  expect(store.tombstones.size).toBe(1);
  expect([...store.affectedMembers().get('m1')!]).toContain('技术异常');
});
it('跨 Scope 聚合边保留完整成员集合', () => {
  const graph = {
    nodes: [
      { id: 'applicant', label: '投保人', kind: 'object' },
      { id: 'rule', label: '联动', kind: 'reaction', members: ['m1', 'm2'] },
    ],
    edges: [{ from: 'applicant', to: 'rule', kind: 'mayRead' }],
  };
  expect(foldGraph(graph, new Set()).edges[0]?.memberIds).toEqual(['m1', 'm2']);
});
it('请求使用生产者和请求身份关联，不推断所属业务操作', () => {
  const store = new ObservationStore();
  store.updates(
    [
      event(1, 'renderer.request', { requestId: 1, status: 'pending' }),
      event(2, 'renderer.request', { requestId: 1, status: 'success' }),
    ],
    0,
  );
  expect(store.actualRelationships().edges[0]?.kind).toBe('request-lifecycle');
});
it('布局循环可终止且状态与高亮不移动节点', () => {
  const graph = {
    nodes: [
      { id: 'a', label: 'a', kind: 'reaction' },
      { id: 'b', label: 'b', kind: 'reaction' },
    ],
    edges: [
      { from: 'a', to: 'b', kind: 'cause' },
      { from: 'b', to: 'a', kind: 'cause' },
    ],
  };
  const result = layoutGraph(graph.nodes, graph.edges, false);
  expect(result.cycles.length).toBeGreaterThan(0);
  expect(
    layoutGraph(
      graph.nodes.map((n) => ({ ...n, status: 'success' })),
      graph.edges,
      false,
    ).positions,
  ).toEqual(result.positions);
});

it('快照接增量保持版本与删除身份，旧版本不能污染新目录', () => {
  const store = new ObservationStore();
  store.snapshot(
    [{ record: 'reaction-instance', entityId: 'old', ruleId: 'copy', binding: {} }],
    1,
  );
  const key = JSON.stringify(['reaction-instance', 'new']);
  const delta = {
    status: 'ok' as const,
    baseRevision: 1,
    revision: 2,
    cut: { producerId: 'runtime', epoch: 'epoch', sequence: 4 },
    removed: [JSON.stringify(['reaction-instance', 'old'])],
    upserts: [
      { key, row: { record: 'reaction-instance', entityId: 'new', ruleId: 'copy', binding: {} } },
    ],
    order: [key],
  };
  store.metadataChanges(delta);
  expect(store.rows.map((row) => row.entityId)).toEqual(['new']);
  expect([...store.tombstones.values()].map((row) => row.entityId)).toEqual(['old']);
  expect(() => store.metadataChanges(delta)).toThrow('版本缺口');
  expect(store.revision).toBe(2);
});

it('执行节点展示变更字段、规则和阶段，而非只有事件类型', () => {
  const store = new ObservationStore();
  store.snapshot(
    [
      {
        record: 'reaction-instance',
        entityId: 'r',
        ruleId: 'copy-applicant',
        binding: { person: { member: 'm1', path: '' } },
      },
    ],
    1,
  );
  store.updates(
    [
      event(1, 'data.changed', {
        path: '/insureds/3/name',
        target: { member: 'm1', path: '/name' },
        before: { dataRevision: 1 },
        after: { dataRevision: 2 },
        topologyChanged: false,
      }),
      event(2, 'reaction.finished', { instance: { entityId: 'r' }, outcome: 'condition-false' }),
    ],
    0,
  );
  const nodes = store.execution().nodes;
  expect(nodes[0]).toMatchObject({ label: '修改 /insureds/3/name', summary: '字段变更' });
  expect(nodes[0]!.detail).toContain('数据版本 1 → 2');
  expect(nodes[1]).toMatchObject({
    label: 'Reaction · copy-applicant',
    summary: '结束 · 条件未满足',
  });
  expect(nodes[1]!.detail).toContain('成员 m1');
});
