import { metadataRowKey } from '@form-engine/runtime/devtools';
import type { MetadataValue, ObservationEvent } from '@form-engine/runtime/devtools';
export type Row = Record<string, MetadataValue>;
export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  parent?: string;
  entity?: string;
  status?: string;
  summary?: string;
  detail?: string;
  member?: string;
  memberCount?: number;
  members?: string[];
  lane?: string;
  time?: number;
}
export interface GraphEdge {
  from: string;
  to: string;
  kind: string;
  mode?: 'potential' | 'actual';
  references?: readonly { from: string; to: string }[];
  memberIds?: readonly string[];
}
const object = (value: unknown): value is Row =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const label = (value: unknown) => (typeof value === 'string' ? value : '');
export const eventKey = (event: ObservationEvent) =>
  `${event.ref.producerId}:${event.ref.epoch}:${event.ref.sequence}`;
/** 工具只持有有界展示副本；快照与执行历史分开，不用迟到工作覆盖当前来源。 */
export class ObservationStore {
  rows: readonly Row[] = [];
  readonly tombstones = new Map<string, Row>();
  private tombstoneBytes = 0;
  private readonly tombstoneSizes = new Map<string, number>();
  private retainRemoved(before: readonly Row[], after: readonly Row[]) {
    const live = new Set(after.map((row, index) => metadataRowKey(row, index)));
    for (const [index, row] of before.entries()) {
      const key = metadataRowKey(row, index);
      if (
        live.has(key) ||
        !['location', 'reaction-instance', 'validation-source', 'renderer-material'].includes(
          String(row.record),
        )
      )
        continue;
      const value = { ...row, lifecycle: 'disposed' };
      const bytes = new TextEncoder().encode(JSON.stringify(value)).byteLength;
      this.tombstoneBytes -= this.tombstoneSizes.get(key) ?? 0;
      this.tombstones.delete(key);
      this.tombstoneSizes.delete(key);
      if (bytes > this.maxEventBytes) continue;
      this.tombstones.set(key, value);
      this.tombstoneSizes.set(key, bytes);
      this.tombstoneBytes += bytes;
      while (this.tombstones.size > this.maxEvents || this.tombstoneBytes > this.maxEventBytes) {
        const oldest = this.tombstones.keys().next().value!;
        this.tombstoneBytes -= this.tombstoneSizes.get(oldest)!;
        this.tombstones.delete(oldest);
        this.tombstoneSizes.delete(oldest);
      }
    }
    for (const key of live)
      if (this.tombstones.has(key)) {
        this.tombstoneBytes -= this.tombstoneSizes.get(key)!;
        this.tombstones.delete(key);
        this.tombstoneSizes.delete(key);
      }
  }
  metadataChanges(
    delta: Extract<import('@form-engine/runtime/devtools').MetadataChangesResult, { status: 'ok' }>,
  ) {
    if (delta.baseRevision !== this.revision) throw Error('元数据版本缺口，需要重新获取快照');
    if (delta.revision === this.revision) {
      this.stale = false;
      return;
    }
    const rows = new Map(this.rows.map((row, index) => [metadataRowKey(row, index), row]));
    for (const key of delta.removed) rows.delete(key);
    for (const item of delta.upserts) {
      if (!object(item.row)) throw Error('无效元数据行');
      rows.set(item.key, item.row);
    }
    if (delta.order.length !== rows.size || delta.order.some((key) => !rows.has(key)))
      throw Error('元数据目录不完整');
    this.snapshot(
      delta.order.map((key) => rows.get(key)!),
      delta.revision,
    );
  }
  events: ObservationEvent[] = [];
  revision = 0;
  dropped = 0;
  selection?: string;
  selectedEvent?: string;
  step = 0;
  stale = false;
  operation?: string;
  private eventBytes = 0;
  private readonly sizes = new Map<string, number>();
  private readonly seen = new Set<string>();
  private lastBatch?: string;
  private readonly through = new Map<string, number>();
  constructor(
    readonly maxRows = 20000,
    readonly maxEvents = 10000,
    readonly maxEventBytes = 8_000_000,
  ) {}
  snapshot(rows: readonly MetadataValue[], revision: number) {
    if (rows.length > this.maxRows) throw Error('工具元数据预算超限');
    const next = rows.filter(object);
    this.retainRemoved(this.rows, next);
    this.rows = next;
    this.revision = revision;
    this.stale = false;
  }
  updates(events: readonly ObservationEvent[], dropped: number, batch?: string) {
    if (batch !== undefined && batch === this.lastBatch) return;
    this.lastBatch = batch;
    this.dropped += dropped;
    if (events.length || dropped) this.stale = true;
    for (const event of events) {
      const id = eventKey(event),
        namespace = `${event.ref.producerId}:${event.ref.epoch}`;
      if (event.ref.sequence <= (this.through.get(namespace) ?? -1)) continue;
      this.through.delete(namespace);
      this.through.set(namespace, event.ref.sequence);
      // 全生产者流可能经历任意多次挂载；去重高水位也必须随窗口有界。
      while (this.through.size > this.maxEvents)
        this.through.delete(this.through.keys().next().value!);
      if (this.seen.has(id)) continue;
      const bytes = new TextEncoder().encode(JSON.stringify(event)).byteLength;
      if (bytes > this.maxEventBytes) {
        this.dropped++;
        continue;
      }
      this.seen.add(id);
      this.sizes.set(id, bytes);
      this.eventBytes += bytes;
      this.events.push(event);
      if (event.kind === 'entity.disposed' && object(event.payload.row))
        this.retainRemoved([event.payload.row], []);
      while (this.events.length > this.maxEvents || this.eventBytes > this.maxEventBytes) {
        const removed = eventKey(this.events.shift()!);
        this.seen.delete(removed);
        this.eventBytes -= this.sizes.get(removed) ?? 0;
        this.sizes.delete(removed);
        this.dropped++;
      }
    }
    this.step = Math.min(this.step, this.events.length);
  }
  clear() {
    this.rows = [];
    this.tombstones.clear();
    this.tombstoneSizes.clear();
    this.tombstoneBytes = 0;
    this.events = [];
    this.seen.clear();
    this.sizes.clear();
    this.eventBytes = 0;
    this.lastBatch = undefined;
    this.through.clear();
    this.dropped = 0;
    this.step = 0;
    this.selection = undefined;
    this.operation = undefined;
    this.selectedEvent = undefined;
    this.stale = false;
  }
  relationships(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [],
      edges: GraphEdge[] = [];
    const locations = this.rows.filter((r) => r.record === 'location');
    const byLocation = new Map<string, Row>(),
      byPath = new Map<string, Row>();
    for (const row of locations) {
      byLocation.set(label(row.id), row);
      byPath.set(label(row.path), row);
      nodes.push({
        id: `location:${row.id}`,
        label: label(row.path) || '表单',
        kind: label(row.kind),
        ...(typeof row.member === 'string' ? { member: row.member } : {}),
        ...(typeof row.memberCount === 'number' ? { memberCount: row.memberCount } : {}),
        ...(row.parentId ? { parent: `location:${row.parentId}` } : {}),
      });
    }
    const templates = this.rows.filter((r) => r.record === 'definition');
    const relations = this.rows.filter((r) => r.record === 'relation');
    for (const row of this.rows.filter(
      (r) => r.record === 'reaction-instance' || r.record === 'validation-source',
    )) {
      const entity = label(row.entityId),
        id = `entity:${entity}`,
        binding = object(row.binding) ? row.binding : {};
      const anchors = Object.values(binding).filter(object);
      const owners = anchors
        .map((anchor) => byLocation.get(JSON.stringify([anchor.member ?? null, anchor.path])))
        .filter((row): row is Row => !!row);
      const parents = (row: Row) => {
        const result: Row[] = [];
        const visited = new Set<string>();
        while (!visited.has(String(row.id))) {
          result.push(row);
          visited.add(String(row.id));
          const parent = byLocation.get(String(row.parentId));
          if (!parent) break;
          row = parent;
        }
        return result;
      };
      const location = owners.length
        ? parents(owners[0]!).find((candidate) =>
            owners.every((owner) => parents(owner).some((parent) => parent.id === candidate.id)),
          )
        : byPath.get('');
      nodes.push({
        id,
        entity,
        members: [...new Set(anchors.map((anchor) => label(anchor.member)).filter(Boolean))],
        label: label(row.ruleId) || 'Schema',
        kind: row.record === 'reaction-instance' ? 'reaction' : 'validation',
        ...(location ? { parent: `location:${location.id}` } : {}),
        status: label(row.status) || '当前实例',
      });
      const template = templates.find(
        (t) =>
          t.ruleId === row.ruleId &&
          t.kind === (row.record === 'reaction-instance' ? 'reaction' : 'constraint'),
      );
      if (row.kind === 'schema') {
        const root = byPath.get('');
        if (root) edges.push({ from: `location:${root.id}`, to: id, kind: 'invalidatedBy' });
        for (const issue of this.rows.filter(
          (issue) => issue.record === 'validation-issue' && issue.source === entity,
        )) {
          if (!object(issue.field)) continue;
          const field = byLocation.get(
            JSON.stringify([issue.field.member ?? null, issue.field.path]),
          );
          if (field) edges.push({ from: id, to: `location:${field.id}`, kind: 'reportsTo' });
        }
      }
      if (!template) continue;
      for (const relation of relations.filter((r) => r.subject === template.id)) {
        const target = relation.object;
        if (!object(target)) continue;
        if (target.kind === 'reference' && object(target.reference)) {
          const declared = target.reference;
          const reference =
            declared.source === 'validation' && object(declared.field) ? declared.field : declared;
          const kind = label(relation.kind);
          let field: string;
          if (declared.source === 'context') {
            field = `context:${label(declared.path)}`;
            if (!nodes.some((n) => n.id === field))
              nodes.push({ id: field, label: `Context ${label(declared.path)}`, kind: 'context' });
          } else if (reference.source === 'data') {
            const base =
              typeof reference.scope === 'string' && object(binding[reference.scope])
                ? (binding[reference.scope] as Row)
                : undefined;
            const resolved =
              typeof reference.scope === 'string'
                ? base &&
                  byLocation.get(
                    JSON.stringify([
                      base.member ?? null,
                      `${base.path ?? ''}${reference.path ?? ''}`,
                    ]),
                  )
                : byPath.get(label(reference.path));
            if (!resolved) {
              field = `unresolved:${id}:${relation.id}`;
              nodes.push({ id: field, label: `未解析 ${label(reference.path)}`, kind: 'missing' });
            } else if (declared.source === 'validation') {
              field = `validation-field:${resolved.id}`;
              if (!nodes.some((n) => n.id === field))
                nodes.push({
                  id: field,
                  label: `校验状态 ${label(resolved.path)}`,
                  kind: 'validation-state',
                  parent: `location:${resolved.id}`,
                });
            } else field = `location:${resolved.id}`;
          } else continue;
          edges.push(
            ['mayWrite', 'reportsTo'].includes(kind)
              ? { from: id, to: field, kind }
              : { from: field, to: id, kind },
          );
        } else if (target.kind === 'unresolved') {
          const missing = `unresolved:${id}:${relation.id}`;
          nodes.push({
            id: missing,
            label: `${target.reason}: ${target.reference}`,
            kind: 'missing',
          });
          edges.push({ from: missing, to: id, kind: label(relation.kind) });
        } else if (target.kind === 'definition') {
          const dependency = templates.find((t) => t.id === target.id);
          const peers = this.rows.filter(
            (r) =>
              r.record === 'validation-source' &&
              r.ruleId === dependency?.ruleId &&
              JSON.stringify(r.binding) === JSON.stringify(row.binding),
          );
          for (const peer of peers)
            edges.push({ from: `entity:${peer.entityId}`, to: id, kind: label(relation.kind) });
        }
      }
    }
    if (
      this.rows.some((row) => row.record === 'renderer-view' || row.record === 'renderer-material')
    ) {
      for (const template of templates.filter((row) =>
        ['view', 'material', 'scope', 'template-use'].includes(String(row.kind)),
      ))
        nodes.push({
          id: `definition:${template.id}`,
          label: label(template.material) || label(template.nodeId) || label(template.pointer),
          kind: 'definition',
          status: '定义模板 · 不代表已挂载',
        });
      for (const relation of relations)
        if (object(relation.object) && relation.object.kind === 'definition')
          edges.push({
            from: `definition:${relation.subject}`,
            to: `definition:${relation.object.id}`,
            kind: String(relation.kind),
          });
      for (const row of this.rows.filter(
        (row) => row.record === 'renderer-material' || row.record === 'renderer-view',
      )) {
        const id = `renderer:${row.nodeId ?? 'view'}:${row.occurrence ?? ''}`;
        nodes.push({
          id,
          label: label(row.material) || label(row.profile),
          kind: 'material',
          status: label(row.projection) || label(row.lifecycle),
        });
        const template = templates.find((template) => template.nodeId === row.nodeId);
        if (template) edges.push({ from: `definition:${template.id}`, to: id, kind: 'instanceOf' });
        if (Array.isArray(row.bindings))
          for (const binding of row.bindings)
            if (object(binding)) {
              const field = `binding:${id}:${binding.name}`;
              nodes.push({
                id: field,
                label: String(binding.name),
                kind: 'field',
                parent: id,
                status: String(binding.validationStatus),
              });
              edges.push({ from: field, to: id, kind: 'bindsTo' });
            }
        if (Array.isArray(row.children))
          for (const child of row.children)
            if (object(child)) {
              const childId = `producer:${child.producerId}:${child.epoch}`;
              nodes.push({
                id: childId,
                label: String(child.producerId),
                kind: 'material',
                parent: id,
                status: '已挂载生产者',
              });
              edges.push({ from: id, to: childId, kind: 'contains' });
            }
      }
    }
    for (const node of nodes)
      if (node.parent) edges.push({ from: node.parent, to: node.id, kind: 'contains' });
    return { nodes, edges };
  }
  execution(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes: GraphNode[] = [],
      edges: GraphEdge[] = [];
    const executions = new Map<string, string>(),
      queues = new Map<string, string>(),
      works = new Map<string, string>(),
      calls = new Map<string, string>(),
      requests = new Map<string, string>(),
      workStarts = new Map<string, string>();
    const catalog = new Map(
      [...this.tombstones.values(), ...this.rows]
        .filter((row) => row.entityId)
        .map((row) => [String(row.entityId), row]),
    );
    for (const event of this.events)
      if (
        (event.kind === 'entity.added' || event.kind === 'entity.disposed') &&
        object(event.payload.row)
      )
        catalog.set(event.payload.entity.entityId, event.payload.row);
    const runSources = new Map<string, Row>(),
      commandPaths = new Map<string, Set<string>>();
    for (const event of this.events) {
      const payload = event.payload as unknown as Row,
        namespace = `${event.ref.producerId}:${event.ref.epoch}:`;
      if (event.kind === 'reaction.started' && object(payload.instance))
        runSources.set(namespace + String(payload.executionId), payload.instance);
      if (event.kind === 'data.changed') {
        const key = namespace + String(payload.commandId);
        if (!commandPaths.has(key)) commandPaths.set(key, new Set());
        commandPaths.get(key)!.add(label(payload.path) || '表单根节点');
      }
    }
    const relations = this.relationships(),
      locationLabels = new Map(relations.nodes.map((node) => [node.id, node.label]));
    const fieldsByEntity = new Map<string, string[]>();
    for (const edge of relations.edges)
      if (edge.kind === 'reportsTo') {
        const fields = fieldsByEntity.get(edge.from) ?? [];
        fields.push(locationLabels.get(edge.to) ?? '字段未知');
        fieldsByEntity.set(edge.from, fields);
      }
    const phaseNames: Record<string, string> = {
      started: '开始',
      returned: '已返回',
      finished: '结束',
      created: '创建',
      queued: '排队',
      condition: '条件判断',
      invalidated: '失效',
      'result-published': '结果发布',
      'cancel-attempted': '尝试取消',
      'cancel-returned': '取消返回',
      'eligibility-revoked': '资格撤销',
      discarded: '丢弃',
      'queue-cancelled': '取消排队',
      'attached-work': '关联工作',
      phase: '阶段变化',
    };
    const states: Record<string, string> = {
      true: '条件成立',
      false: '条件不成立',
      absent: '无条件',
      completed: '执行结束',
      changed: '已修改',
      'no-change': '未修改',
      'not-executed': '未执行',
      'condition-false': '条件未满足',
      'condition-error': '条件出错',
      error: '技术错误',
      'partial-error': '部分失败',
      interrupted: '中断',
      valid: '通过',
      invalid: '未通过',
      pending: '等待返回',
      settling: '处理结果',
      done: '结束',
      cancelled: '已取消',
      resolved: '已返回',
      rejected: '请求失败',
      stale: '已过期',
      unverified: '待校验',
      queued: '等待执行',
      running: '执行中',
      blocked: '等待依赖',
      discarded: '已丢弃',
      'late-discarded': '迟到结果已丢弃',
      incomplete: '未完成',
      success: '成功',
    };
    const known = new Set(this.events.map(eventKey));
    const link = (reference: unknown, to: string, kind: string) => {
      if (!object(reference) || typeof reference.sequence !== 'number') return;
      const from = `${reference.producerId}:${reference.epoch}:${reference.sequence}`;
      if (!known.has(from) && !nodes.some((n) => n.id === from))
        nodes.push({ id: from, label: '窗口外 / 丢失事实', kind: 'missing' });
      edges.push({ from, to, kind });
    };
    for (const event of this.events) {
      const payload = event.payload as unknown as Row,
        id = eventKey(event);
      const identity = object(payload.instance)
        ? payload.instance
        : object(payload.source)
          ? payload.source
          : runSources.get(
              `${event.ref.producerId}:${event.ref.epoch}:${payload.reactionExecutionId}`,
            );
      const row = identity ? catalog.get(String(identity.entityId)) : undefined;
      const state = label(payload.outcome) || label(payload.status) || label(payload.phase);
      const phase = phaseNames[event.kind.split('.').at(-1)!] ?? event.kind;
      const rule =
        (row?.kind === 'schema' ? '根 Schema' : label(row?.ruleId)) ||
        (identity ? `未知规则 ${identity.entityId}` : '');
      const bindings = object(row?.binding)
        ? Object.entries(row.binding)
            .map(([scope, anchor]) =>
              object(anchor)
                ? `${scope}: ${anchor.member ? `成员 ${anchor.member}` : '根'}${anchor.path || ''}`
                : scope,
            )
            .join(' · ')
        : '';
      let title: string = event.kind,
        summary = [phase, states[state] ?? state].filter(Boolean).join(' · ');
      let detail = bindings || `事件 #${event.ref.sequence}`;
      const fields = identity ? fieldsByEntity.get(`entity:${identity.entityId}`) : undefined;
      if (fields?.length) detail = `当前归属 ${[...new Set(fields)].join('、')} · ${detail}`;
      if (event.kind === 'data.changed') {
        title = `修改 ${label(payload.path) || (object(payload.target) ? label(payload.target.path) : '') || '表单根节点'}`;
        summary = payload.topologyChanged ? '字段变更 · 结构已变化' : '字段变更';
        detail =
          object(payload.before) && object(payload.after)
            ? `数据版本 ${payload.before.dataRevision} → ${payload.after.dataRevision}`
            : detail;
        if (object(payload.target) && payload.target.member)
          detail += ` · 成员 ${payload.target.member}`;
      } else if (event.kind.startsWith('reaction.')) title = `Reaction · ${rule || '规则信息缺失'}`;
      else if (event.kind.startsWith('work.') || event.kind.startsWith('source.')) {
        title = `校验 · ${rule || '来源信息缺失'}`;
        if (payload.workId != null) summary += ` · Work #${payload.workId}`;
      } else if (event.kind.startsWith('call.')) title = `完整校验 · Call #${payload.callId}`;
      else if (event.kind === 'renderer.request') {
        title = `请求 · ${payload.name}`;
        detail = `物料 ${payload.nodeId} · 请求 #${payload.requestId}`;
      } else if (event.kind === 'operation.started') {
        title =
          (
            {
              dispatch: '修改表单',
              replaceContext: '更新上下文',
              validate: '主动校验',
              initialize: '初始化表单',
            } as Record<string, string>
          )[String(payload.source)] ?? '操作';
        summary = '操作开始';
      } else if (event.kind === 'operation.returned') {
        title = '操作返回';
        summary = payload.ok ? (payload.changed ? '已修改数据' : '未修改数据') : '操作失败';
      } else if (event.kind === 'action.finished')
        title = `${rule || (payload.kind === 'host.emit' ? 'Host 动作' : '规则动作')} · 动作 ${Number(payload.actionIndex) + 1}`;
      else if (event.kind === 'command.finished') {
        const paths = commandPaths.get(
          `${event.ref.producerId}:${event.ref.epoch}:${payload.commandId}`,
        );
        title = paths?.size ? `命令 · ${[...paths].join('、')}` : '命令结果 · 目标未上报';
        detail = `命令 ${payload.commandId}`;
      } else if (event.kind === 'entity.added' || event.kind === 'entity.disposed') {
        title = event.kind === 'entity.added' ? '实例新增' : '实例移除';
        summary = object(payload.row)
          ? String(payload.row.ruleId ?? payload.row.record)
          : '实例目录变化';
      }
      if (event.kind === 'diagnostic') {
        title = `诊断 · ${payload.code ?? '代码未上报'}`;
        summary = '异常事实';
      }
      if (event.kind === 'metadata.changed') {
        title = '目录更新';
        summary = label(payload.reason) || '元数据已变化';
      }
      nodes.push({
        id,
        label: title,
        summary,
        detail,
        kind: event.kind,
        entity: identity ? label(identity.entityId) : undefined,
        status: label(payload.outcome) || label(payload.status) || label(payload.phase),
        time: event.monotonicTime,
        lane:
          typeof payload.workId === 'number'
            ? `Work ${event.ref.producerId}:${payload.workId}`
            : typeof payload.callId === 'number'
              ? `Call ${event.ref.producerId}:${payload.callId}`
              : event.kind === 'renderer.request'
                ? `物料请求 ${event.ref.producerId}`
                : identity
                  ? `实例 ${identity.entityId}`
                  : '操作 / 数据',
      });
      if (payload.operation) link(payload.operation, id, 'operation');
      if (payload.cause) link(payload.cause, id, 'cause');
      if (Array.isArray(payload.causes))
        for (const cause of payload.causes) link(cause, id, 'cause');
      if (payload.returned) link(payload.returned, id, 'returned');
      const namespace = `${event.ref.producerId}:${event.ref.epoch}:`;
      if (event.kind === 'renderer.request') {
        const request = namespace + String(payload.requestId);
        const prior = requests.get(request);
        if (prior) edges.push({ from: prior, to: id, kind: 'request-lifecycle' });
        requests.set(request, id);
      }
      const queue = payload.queueEntryId ? namespace + label(payload.queueEntryId) : '';
      if (queue) {
        const before = queues.get(queue);
        if (before) edges.push({ from: before, to: id, kind: 'queue' });
        queues.set(queue, id);
      }
      const executionId = label(payload.executionId) || label(payload.reactionExecutionId);
      const execution = executionId ? namespace + executionId : '';
      if (execution) {
        const start = executions.get(execution);
        if (start) edges.push({ from: start, to: id, kind: 'execution' });
        else if (event.kind === 'reaction.started') executions.set(execution, id);
      }
      if (typeof payload.callId === 'number') {
        const callKey = namespace + payload.callId;
        const start = calls.get(callKey);
        if (event.kind === 'call.started') calls.set(callKey, id);
        else if (start) edges.push({ from: start, to: id, kind: 'call' });
        else {
          const missing = `missing-call:${callKey}`;
          if (!nodes.some((n) => n.id === missing))
            nodes.push({ id: missing, label: '窗口外 Call 开始', kind: 'missing' });
          edges.push({ from: missing, to: id, kind: 'call' });
        }
      }
      if (typeof payload.workId === 'number') {
        const workKey = namespace + payload.workId;
        const start = workStarts.get(workKey);
        if (event.kind === 'work.created') workStarts.set(workKey, id);
        else if (
          start &&
          (event.kind.startsWith('work.') || event.kind === 'source.result-published')
        )
          edges.push({ from: start, to: id, kind: 'work-lifecycle' });
        else if (start && event.kind === 'call.attached-work')
          edges.push({ from: id, to: start, kind: 'consumes-work' });
        const prior = works.get(workKey);
        if (prior) edges.push({ from: prior, to: id, kind: 'work-order' });
        works.set(workKey, id);
      }
    }
    if (this.operation) {
      const visible = new Set([this.operation]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const edge of edges)
          if (
            edge.kind !== 'work-order' &&
            edge.kind !== 'request-lifecycle' &&
            visible.has(edge.from) &&
            !visible.has(edge.to)
          ) {
            visible.add(edge.to);
            changed = true;
          }
      }
      return {
        nodes: nodes.filter((node) => visible.has(node.id)),
        edges: edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)),
      };
    }
    return { nodes, edges };
  }
  executionEvents() {
    if (!this.operation) return this.events;
    const ids = new Set(this.execution().nodes.map((node) => node.id));
    return this.events.filter((event) => ids.has(eventKey(event)));
  }
  actualRelationships() {
    const relation = this.relationships();
    const graph = this.execution();
    const eventNodes = new Map(this.events.map((event) => [eventKey(event), event]));
    const executions = new Map<string, string>();
    for (const event of this.events) {
      const payload = event.payload as unknown as Row;
      if (event.kind === 'reaction.started' && object(payload.instance))
        executions.set(
          `${event.ref.producerId}:${event.ref.epoch}:${payload.executionId}`,
          `entity:${payload.instance.entityId}`,
        );
    }
    const project = (id: string): string => {
      const event = eventNodes.get(id);
      if (!event) return id;
      const payload = event.payload as unknown as Row;
      const entity = object(payload.instance)
        ? payload.instance
        : object(payload.source)
          ? payload.source
          : undefined;
      if (entity) return `entity:${entity.entityId}`;
      if (event.kind === 'data.changed' && object(payload.target))
        return `location:${JSON.stringify([payload.target.member ?? null, payload.target.path])}`;
      if (payload.reactionExecutionId)
        return (
          executions.get(
            `${event.ref.producerId}:${event.ref.epoch}:${payload.reactionExecutionId}`,
          ) ?? id
        );
      return id;
    };
    const nodes = new Map(relation.nodes.map((node) => [node.id, node]));
    const used = new Set<string>();
    const edges: GraphEdge[] = [];
    for (const edge of graph.edges) {
      if (edge.kind === 'work-order') continue;
      const from = project(edge.from),
        to = project(edge.to);
      if (from === to) continue;
      used.add(from);
      used.add(to);
      edges.push({
        ...edge,
        from,
        to,
        mode: 'actual',
        references: [{ from: edge.from, to: edge.to }],
      });
    }
    for (const id of used)
      if (!nodes.has(id)) {
        const old = [...this.tombstones.values()].find(
          (row) => `entity:${row.entityId}` === id || `location:${row.id}` === id,
        );
        nodes.set(
          id,
          old
            ? {
                id,
                label: String(old.ruleId ?? old.path ?? id),
                kind: 'missing',
                status: '已删除 · 历史引用',
              }
            : (graph.nodes.find((node) => node.id === id) ?? {
                id,
                label: '窗口外 / 未知',
                kind: 'missing',
              }),
        );
      }
    for (const id of [...used]) {
      let parent = nodes.get(id)?.parent;
      const seen = new Set<string>();
      while (parent && !seen.has(parent)) {
        seen.add(parent);
        used.add(parent);
        parent = nodes.get(parent)?.parent;
      }
    }
    return { nodes: [...nodes.values()].filter((node) => used.has(node.id)), edges };
  }
  affectedMembers() {
    const graph = this.execution();
    const ids = new Set(graph.nodes.map((node) => node.id));
    const current = new Map(
      [...this.rows, ...this.tombstones.values()]
        .filter((row) => row.entityId)
        .map((row) => [String(row.entityId), row]),
    );
    const members = new Map<string, Set<string>>();
    for (const event of this.events) {
      if (!ids.has(eventKey(event)) || !object(event.payload)) continue;
      const payload = event.payload as Row;
      const identity = object(payload.instance)
        ? payload.instance
        : object(payload.source)
          ? payload.source
          : undefined;
      const row = identity ? current.get(String(identity.entityId)) : undefined;
      const keys = new Set<string>();
      if (object(row?.binding))
        for (const anchor of Object.values(row.binding))
          if (object(anchor) && typeof anchor.member === 'string') keys.add(anchor.member);
      if (object(payload.target) && typeof payload.target.member === 'string')
        keys.add(payload.target.member);
      for (const key of keys) {
        let states = members.get(key);
        if (!states) members.set(key, (states = new Set()));
        if (event.kind === 'work.started' || event.kind === 'reaction.started')
          states.add('已启动');
        if (event.kind === 'work.finished' || event.kind === 'reaction.finished')
          states.add('含已结束执行');
        if (payload.status === 'invalid') states.add('业务未通过');
        if (
          ['error', 'rejected', 'condition-error', 'partial-error'].includes(
            String(payload.outcome),
          )
        )
          states.add('技术异常');
      }
    }
    return members;
  }
}
/** 折叠不丢跨容器边；聚合节点保留成员数下界，布局输入只含当前可见节点。 */
export function foldGraph(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  collapsed: Set<string>,
) {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const representative = (id: string) => {
    let node = byId.get(id),
      result = id;
    const visited = new Set<string>();
    while (node?.parent && !visited.has(node.parent)) {
      visited.add(node.parent);
      if (collapsed.has(node.parent)) result = node.parent;
      node = byId.get(node.parent);
    }
    return result;
  };
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    const id = representative(node.id);
    if (id !== node.id) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const summaries = new Map<string, { members: Set<string>; states: Map<string, number> }>();
  for (const node of graph.nodes) {
    const id = representative(node.id);
    if (id === node.id) continue;
    let summary = summaries.get(id);
    if (!summary) summaries.set(id, (summary = { members: new Set(), states: new Map() }));
    if (node.member) summary.members.add(node.member);
    for (const member of node.members ?? []) summary.members.add(member);
    if (node.status) summary.states.set(node.status, (summary.states.get(node.status) ?? 0) + 1);
  }
  const nodes = graph.nodes
    .filter((n) => representative(n.id) === n.id)
    .map((n) => ({
      ...n,
      label: counts.has(n.id)
        ? `${n.label} · ${n.kind === 'array' || n.member ? `${n.memberCount ?? (n.member ? 1 : (summaries.get(n.id)?.members.size ?? 0))} 个成员 / ` : ''}${counts.get(n.id)} 个节点`
        : n.label,
      status: summaries.get(n.id)?.states.size
        ? [...summaries.get(n.id)!.states].map(([state, count]) => `${state} ${count}`).join(' · ')
        : n.status,
    }));
  const groups = new Map<
    string,
    { edge: GraphEdge; references: Array<{ from: string; to: string }>; members: Set<string> }
  >();
  const memberOf = (id: string) => {
    const members = new Set<string>();
    let node = byId.get(id);
    const visited = new Set<string>();
    while (node && !visited.has(node.id)) {
      visited.add(node.id);
      if (node.member) members.add(node.member);
      for (const member of node.members ?? []) members.add(member);
      node = node.parent ? byId.get(node.parent) : undefined;
    }
    return [...members];
  };
  for (const edge of graph.edges) {
    const from = representative(edge.from),
      to = representative(edge.to),
      key = JSON.stringify([from, to, edge.kind, edge.mode ?? 'potential']);
    if (from === to) continue;
    let group = groups.get(key);
    if (!group)
      groups.set(
        key,
        (group = { edge: { ...edge, from, to }, references: [], members: new Set() }),
      );
    group.references.push(...(edge.references ?? [{ from: edge.from, to: edge.to }]));
    for (const member of edge.memberIds ?? [...memberOf(edge.from), ...memberOf(edge.to)])
      if (member) group.members.add(member);
  }
  const edges = [...groups.values()].map((group) => ({
    ...group.edge,
    references: group.references,
    memberIds: [...group.members],
  }));
  return { nodes, edges, representative };
}
export function neighborhood(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  selected: string,
  full: boolean,
) {
  const active = new Set([selected]);
  // 上游与下游分别遍历；不能在共同上游处转向旁支。
  for (const direction of ['up', 'down'] as const) {
    const seen = new Set([selected]);
    let frontier = [selected];
    while (frontier.length) {
      const next: string[] = [];
      for (const edge of graph.edges) {
        const from = direction === 'down' ? edge.from : edge.to;
        const to = direction === 'down' ? edge.to : edge.from;
        if (frontier.includes(from) && !seen.has(to)) {
          seen.add(to);
          active.add(to);
          next.push(to);
        }
      }
      if (!full) break;
      frontier = next;
    }
  }
  return active;
}
