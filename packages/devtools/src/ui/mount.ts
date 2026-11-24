import { layoutGraph } from '../client/graph-layout.js';
import { observerStyles } from './styles.js';
import type { ObservationProducerInfo, ObservationCommand } from '@form-engine/runtime/devtools';
import {
  createObservationClient,
  type ObservationTransport,
} from '../client/observation-client.js';
import {
  ObservationStore,
  foldGraph,
  neighborhood,
  eventKey,
  type GraphNode,
  type GraphEdge,
} from '../client/observation-store.js';
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
/** 单一新版消费链；事件接收、快照查询、视图渲染分别调度，业务不调用视图。 */
export function mountDevtools(root: HTMLElement, transport: ObservationTransport) {
  const doc = root.ownerDocument,
    client = createObservationClient(transport, () => crypto.randomUUID()),
    store = new ObservationStore(),
    history = new ObservationStore();
  let destroyed = false,
    running = true,
    generation = 0,
    stateGeneration = 0,
    unsubscribe: (() => void) | undefined;
  let producers: readonly ObservationProducerInfo[] = [],
    selected: ObservationProducerInfo | undefined;
  let session: { sessionId: string; cursor: string } | undefined;
  let view: '关系' | '执行' | '状态' | '诊断' = '关系',
    message = '正在连接…',
    full = false,
    actual = false,
    zoom = 1,
    values: string | undefined;
  const collapsed = new Set<string>();
  let reopen = false;
  let graphPage = 0,
    statePage = 0;
  const captureSummary = '自动接收连接后的执行事实；连接前的起点与已结束任务保持未知。';
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (task: () => Promise<void>) => {
    queue = queue.then(async () => {
      if (destroyed) return;
      try {
        await task();
      } catch (error) {
        message = `连接失败：${String(error)}`;
      }
      if (!destroyed) render();
    });
    return queue;
  };
  const targetSession = () => session;
  const query = async (command: ObservationCommand) => {
    const current = stateGeneration;
    const result = (await client.query(command)).result;
    if (
      result.status === 'session-expired' &&
      (command.op === 'inspectValue' || command.op === 'locateEvidence') &&
      selected?.ref.producerId === command.producer.producerId &&
      selected.ref.epoch === command.producer.epoch &&
      running &&
      !destroyed &&
      current === stateGeneration
    ) {
      session = undefined;
      await snapshot(true);
      if (targetSession() && current === stateGeneration)
        return (await client.query({ ...command, sessionId: target().sessionId })).result;
    }
    return result;
  };
  const target = () => {
    if (!selected || !session) throw Error('尚未选择对象');
    return { producer: selected.ref, sessionId: session.sessionId };
  };
  const close = async () => {
    if (selected && session) await query({ op: 'closeObservation', ...target() });
    session = undefined;
  };
  const snapshot = async (initial = false) => {
    if (!selected) return;
    const current = generation,
      state = stateGeneration,
      producer = selected,
      previousSession = session;
    let retained = false;
    const open = await query({ op: 'openObservation', producer: selected.ref });
    if (open.status !== 'ok' || !('snapshotId' in open)) {
      message = `快照不可用：${open.status}`;
      return;
    }
    const owned = { producer: selected.ref, sessionId: open.sessionId };
    const rows: import('@form-engine/runtime/devtools').MetadataValue[] = [];
    let cursor: string | undefined;
    try {
      do {
        const page = await query({
          op: 'readSnapshotPage',
          ...owned,
          snapshotId: open.snapshotId,
          ...(cursor ? { cursor } : {}),
        });
        if (page.status !== 'ok' || !('rows' in page)) throw Error(`快照 ${page.status}`);
        if (rows.length + page.rows.length > store.maxRows) throw Error('快照容量超限');
        rows.push(...page.rows);
        cursor = page.nextCursor;
      } while (cursor && !destroyed);
      if (destroyed || current !== generation || state !== stateGeneration || selected !== producer)
        return;
      store.snapshot(rows, open.revision);
      values = undefined;
      session = { sessionId: open.sessionId, cursor: open.cursor };
      retained = true;
      if (previousSession)
        await query({
          op: 'closeObservation',
          producer: producer.ref,
          sessionId: previousSession.sessionId,
        });
      if (initial) {
        for (const row of store.rows)
          if (
            row.record === 'location' &&
            (row.kind === 'array' || (row.kind === 'object' && !!row.path))
          )
            collapsed.add(`location:${row.id}`);
      }
      if (current === generation && state === stateGeneration && selected === producer)
        message = '已连接 · 自动接收 · 元数据快照已固定';
    } finally {
      if (
        !retained ||
        destroyed ||
        current !== generation ||
        state !== stateGeneration ||
        selected !== producer
      )
        await query({ op: 'closeObservation', ...owned });
    }
  };
  const updateMetadata = async () => {
    if (!selected) return;
    if (!session) {
      await snapshot(true);
      return;
    }
    const state = stateGeneration,
      producer = selected;
    const result = await query({
      op: 'readMetadataChanges',
      ...target(),
      baseRevision: store.revision,
    });
    if (destroyed || state !== stateGeneration || producer !== selected) return;
    if (result.status === 'ok' && 'upserts' in result) {
      store.metadataChanges(result);
      message = '已连接 · 自动接收 · 元数据增量已同步';
    } else if (['session-expired', 'invalid-cursor', 'snapshot-expired'].includes(result.status))
      await snapshot(!session);
    else {
      store.stale = true;
      message = `元数据暂不可用：${result.status}`;
    }
  };
  const belongs = (
    event: import('@form-engine/runtime/devtools').ObservationEvent,
    producer: ObservationProducerInfo,
  ) => {
    const matches = (ref: unknown) =>
      object(ref) && ref.producerId === producer.ref.producerId && ref.epoch === producer.ref.epoch;
    return (
      matches(event.ref) ||
      (event.kind === 'renderer.request' &&
        (matches(event.payload.runtime) || matches(event.payload.view)))
    );
  };
  const select = async (producer: ObservationProducerInfo) => {
    const state = ++stateGeneration;
    await close();
    if (destroyed || !running || state !== stateGeneration) return;
    selected = producer;
    reopen = false;
    store.clear();
    store.updates(
      history.events.filter((e) => belongs(e, producer)),
      history.dropped,
    );
    collapsed.clear();
    await snapshot(true);
  };
  let refreshPending: number | undefined, directoryPending: number | undefined;
  let renderTimer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRender = () => {
    if (renderTimer !== undefined) return;
    renderTimer = setTimeout(() => {
      renderTimer = undefined;
      if (!destroyed) render();
    }, 16);
  };
  const connect = () => {
    unsubscribe?.();
    const current = generation;
    unsubscribe = client.subscribe((push) => {
      if (destroyed || !running || current !== generation) return;
      const state = stateGeneration;
      if (push.kind === 'status') {
        message =
          push.status === 'waiting'
            ? '等待表单实例 · 请先在页面打开表单'
            : push.status === 'incompatible'
              ? '观测协议不兼容，请同步升级 Runtime 与工具'
              : `连接不可用：${push.status}`;
        if (push.status === 'disconnected') {
          stateGeneration++;
          session = undefined;
          store.stale = true;
        }
        scheduleRender();
        return;
      }
      if (push.kind === 'directory') {
        producers = push.producers;
        if (directoryPending === state) return;
        directoryPending = state;
        void enqueue(async () => {
          if (directoryPending === state) directoryPending = undefined;
          if (current !== generation || state !== stateGeneration || !running) return;
          if (
            selected &&
            !producers.some(
              (p) =>
                p.ref.producerId === selected!.ref.producerId &&
                p.ref.epoch === selected!.ref.epoch,
            )
          ) {
            await close();
            if (destroyed || current !== generation || state !== stateGeneration || !running)
              return;
            selected = undefined;
            store.stale = true;
            message = '生产者已销毁；历史记录保留，当前状态不可用';
            const form = producers.find((producer) => producer.kind === 'runtime');
            if (form) await select(form);
          } else if (selected) {
            const initial = reopen || !session;
            reopen = false;
            if (initial) await snapshot(true);
            else await updateMetadata();
          } else {
            const form = producers.find((producer) => producer.kind === 'runtime');
            if (form) await select(form);
            else message = '等待表单实例 · 请先在页面打开表单';
          }
        });
        return;
      }
      // 接收只更新有界副本，不调用 render，也不在每个事件上读取整份元数据。
      history.updates(push.events, push.dropped);
      const relevant = selected ? push.events.filter((e) => belongs(e, selected!)) : [];
      store.updates(relevant, push.dropped);
      if (selected && relevant.some((e) => e.kind !== 'diagnostic') && refreshPending !== state) {
        refreshPending = state;
        void enqueue(async () => {
          if (refreshPending === state) refreshPending = undefined;
          if (current === generation && state === stateGeneration && running)
            await snapshot(!session);
        });
      }
      scheduleRender();
    });
  };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text: string, action: () => void) => {
    const node = el('button', text);
    node.type = 'button';
    node.onclick = action;
    return node;
  };
  let lastGraphFocus: string | undefined;
  let layoutCache: { key: string; value: ReturnType<typeof layoutGraph> } | undefined;
  const graph = (input: { nodes: GraphNode[]; edges: GraphEdge[] }, execution = false) => {
    const folded = execution
      ? { ...input, representative: (id: string) => id }
      : foldGraph(input, collapsed);
    const chosen = execution
      ? store.events.find((e) => eventKey(e) === store.selectedEvent)
      : undefined;
    const selectedId = execution
      ? chosen
        ? eventKey(chosen)
        : undefined
      : folded.representative(store.selection ?? '');
    const selections = selectedId
      ? [selectedId]
      : execution
        ? input.nodes
            .filter((n) => n.entity && `entity:${n.entity}` === store.selection)
            .map((n) => n.id)
        : [];
    const visibleSelections = selections.filter((id) =>
      folded.nodes.some((node) => node.id === id),
    );
    const active = visibleSelections.length
      ? new Set(visibleSelections.flatMap((id) => [...neighborhood(folded, id, full)]))
      : undefined;
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', execution ? '执行路径图' : '关系图');
    const defs = doc.createElementNS(svg.namespaceURI, 'defs');
    const marker = doc.createElementNS(svg.namespaceURI, 'marker');
    marker.setAttribute('id', 'observation-arrow');
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('orient', 'auto-start-reverse');
    const arrow = doc.createElementNS(svg.namespaceURI, 'path');
    arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    arrow.setAttribute('fill', '#a995df');
    marker.append(arrow);
    defs.append(marker);
    svg.append(defs);
    const pageSize = 120;
    const pages = Math.max(1, Math.ceil(folded.nodes.length / pageSize));
    graphPage = Math.min(graphPage, pages - 1);
    const visible = folded.nodes.slice(graphPage * pageSize, (graphPage + 1) * pageSize);
    const layoutKey = JSON.stringify([
      execution,
      visible.map((node) => [node.id, node.parent, node.lane]),
      folded.edges.map((edge) => [edge.from, edge.to, edge.kind]),
    ]);
    if (layoutCache?.key !== layoutKey)
      layoutCache = { key: layoutKey, value: layoutGraph(visible, folded.edges, execution) };
    const layout = layoutCache.value,
      positions = layout.positions;
    svg.setAttribute('viewBox', `0 0 ${layout.width} ${layout.height}`);
    (svg as SVGSVGElement).style.width = `${layout.width * zoom}px`;
    for (const lane of layout.lanes) {
      const title = doc.createElementNS(svg.namespaceURI, 'text');
      title.setAttribute('x', '16');
      title.setAttribute('y', String(lane.y));
      title.setAttribute('font-size', '11');
      title.textContent = folded.nodes.find((node) => node.id === lane.label)?.label ?? lane.label;
      svg.append(title);
    }
    for (const edge of folded.edges) {
      const from = positions.get(edge.from),
        to = positions.get(edge.to);
      if (!from || !to) continue;
      const line = doc.createElementNS(svg.namespaceURI, 'path');
      line.setAttribute(
        'd',
        from.x === to.x
          ? `M ${from.x + 120} ${from.y + (execution ? 70 : 46)} C ${from.x + 120} ${from.y + (execution ? 90 : 72)}, ${to.x + 120} ${to.y - 20}, ${to.x + 120} ${to.y}`
          : `M ${from.x + (to.x > from.x ? 240 : 0)} ${from.y + (execution ? 35 : 23)} C ${(from.x + to.x + 240) / 2} ${from.y + (execution ? 35 : 23)}, ${(from.x + to.x + 240) / 2} ${to.y + (execution ? 35 : 23)}, ${to.x + (to.x > from.x ? 0 : 240)} ${to.y + (execution ? 35 : 23)}`,
      );
      line.setAttribute('fill', 'none');
      line.setAttribute(
        'stroke',
        active && !(active.has(edge.from) && active.has(edge.to)) ? '#e5e8ee' : '#a995df',
      );
      line.setAttribute('stroke-width', '2');
      line.setAttribute('marker-end', 'url(#observation-arrow)');
      if (
        ['contains', 'work-order', 'work-lifecycle', 'request-lifecycle', 'consumes-work'].includes(
          edge.kind,
        )
      )
        line.setAttribute('stroke-dasharray', '5 4');
      const title = doc.createElementNS(svg.namespaceURI, 'title');
      title.textContent = `${edge.kind} · ${edge.references?.length ?? 1} 条关系 · ${edge.memberIds?.length ?? 0} 个成员`;
      line.append(title);
      svg.append(line);
    }
    const executionIndexes = new Map(
      (execution ? store.executionEvents() : []).map((event, index) => [eventKey(event), index]),
    );
    visible.forEach((node) => {
      const position = positions.get(node.id)!;
      const group = doc.createElementNS(svg.namespaceURI, 'g');
      group.setAttribute('transform', `translate(${position.x},${position.y})`);
      group.setAttribute('tabindex', '0');
      group.setAttribute('role', 'button');
      group.setAttribute('aria-label', node.label);
      if (node.id === selectedId) {
        group.setAttribute('data-selected', 'true');
        group.setAttribute('data-x', String(position.x * zoom));
        group.setAttribute('data-y', String(position.y * zoom));
      }
      if (node.entity) group.setAttribute('data-entity', node.entity);
      group.setAttribute('opacity', active && !active.has(node.id) ? '0.2' : '1');
      const rect = doc.createElementNS(svg.namespaceURI, 'rect');
      rect.setAttribute('width', '240');
      rect.setAttribute('height', execution ? '70' : '46');
      rect.setAttribute('rx', '8');
      const index = executionIndexes.get(node.id) ?? -1;
      const highlighted = execution && index >= 0 && index < store.step;
      rect.setAttribute(
        'fill',
        selectedId === node.id
          ? '#fbf9ff'
          : highlighted
            ? '#edf6f2'
            : node.kind === 'missing'
              ? '#fff5e8'
              : '#ffffff',
      );
      rect.setAttribute('stroke', selectedId === node.id ? '#8765dc' : '#dce1e9');
      const text = doc.createElementNS(svg.namespaceURI, 'text');
      text.setAttribute('x', '10');
      text.setAttribute('y', '19');
      text.setAttribute('font-size', '12');
      const clip = (value: string, limit: number) => {
        let width = 0,
          result = '';
        for (const char of value) {
          width += char.charCodeAt(0) > 255 ? 2 : 1;
          if (width > limit) return result + '…';
          result += char;
        }
        return result;
      };
      text.textContent = clip(node.label, 32);
      const status = doc.createElementNS(svg.namespaceURI, 'text');
      status.setAttribute('x', '10');
      status.setAttribute('y', '35');
      status.setAttribute('font-size', '10');
      status.textContent = clip(node.summary ?? node.status ?? node.kind, 40);
      const info = doc.createElementNS(svg.namespaceURI, 'text');
      info.setAttribute('x', '10');
      info.setAttribute('y', '56');
      info.setAttribute('font-size', '10');
      info.textContent = clip(node.detail ?? '', 40);
      const tooltip = doc.createElementNS(svg.namespaceURI, 'title');
      tooltip.textContent = [
        node.label,
        node.summary,
        node.detail,
        node.kind,
        node.time === undefined ? '' : `页面计时 +${(node.time / 1000).toFixed(3)}s`,
      ]
        .filter(Boolean)
        .join('\n');
      const choose = () => {
        store.selectedEvent = execution ? node.id : undefined;
        store.selection = execution && node.entity ? `entity:${node.entity}` : node.id;
        values = undefined;
        render();
      };
      group.addEventListener('click', choose);
      group.addEventListener('keydown', (event) => {
        if ((event as KeyboardEvent).key === 'Enter') choose();
      });
      group.append(rect, text, status, tooltip);
      if (execution) group.append(info);
      svg.append(group);
    });
    void chosen;
    const wrapper = el('div');
    wrapper.className = 'graph-scroll';
    if (pages > 1)
      wrapper.append(
        button('上一页节点', () => {
          graphPage = Math.max(0, graphPage - 1);
          render();
        }),
        el('span', `${graphPage + 1} / ${pages} 页 · 跨页连线未绘制`),
        button('下一页节点', () => {
          graphPage = Math.min(pages - 1, graphPage + 1);
          render();
        }),
      );
    if (layout.cycles.length)
      wrapper.append(el('p', `${layout.cycles.length} 个循环依赖组（不代表重复执行）`));
    wrapper.append(svg);
    return wrapper;
  };
  let mounted:
    | {
        shell: HTMLElement;
        header: HTMLElement;
        picker: HTMLSelectElement;
        status: HTMLElement;
        nav: HTMLElement;
        note: HTMLElement;
        main: HTMLElement;
      }
    | undefined;
  let directoryKey = '',
    mainKey = '';
  const updateDirectory = () => {
    if (!mounted) return;
    const key = JSON.stringify([selected?.ref, producers]);
    if (key === directoryKey || doc.activeElement === mounted.picker) return;
    directoryKey = key;
    const options: HTMLOptionElement[] = [];
    if (!selected) {
      const placeholder = el('option', '选择观测对象');
      placeholder.value = '';
      placeholder.selected = true;
      options.push(placeholder);
    }
    for (const producer of producers.filter(
      (p) => p.kind === 'runtime' || p.ref.producerId === selected?.ref.producerId,
    )) {
      const option = el(
        'option',
        `${producer.kind === 'runtime' ? '表单' : producer.kind} · ${producer.label}`,
      );
      option.value = producer.ref.producerId;
      option.selected = producer.ref.producerId === selected?.ref.producerId;
      options.push(option);
    }
    mounted.picker.replaceChildren(...options);
    mounted.picker.hidden = options.length <= 1;
  };
  function render(forceMain = false) {
    if (destroyed) return;
    if (!mounted) {
      const style = el('style');
      style.textContent = observerStyles;
      const shell = el('section');
      shell.className = 'form-observer';
      const header = el('header');
      const logo = el('span', 'FE');
      logo.className = 'observer-logo';
      header.append(logo, el('h1', 'Form Engine · DevTools'));
      const picker = el('select');
      picker.setAttribute('aria-label', '观测对象');
      picker.onchange = () => {
        const producer = producers.find((p) => p.ref.producerId === picker.value);
        if (producer) void enqueue(() => select(producer));
      };
      header.append(picker);
      const more = el('details');
      more.className = 'observer-more';
      more.append(el('summary', '更多'));
      more.append(button('刷新当前状态', () => void enqueue(() => snapshot(!session))));
      more.append(
        button(running ? '断开连接' : '重新连接', () => {
          running = !running;
          generation++;
          stateGeneration++;
          unsubscribe?.();
          unsubscribe = undefined;
          if (!running)
            void enqueue(async () => {
              await close();
              reopen = true;
              store.clear();
              history.clear();
              message = '已断开；缓存已清空';
            });
          else
            void enqueue(async () => {
              if (running) connect();
            });
        }),
      );
      header.append(more);
      shell.append(header);
      const status = el('p');
      status.setAttribute('role', 'status');
      shell.append(status);
      const nav = el('nav');
      for (const name of ['关系', '执行'] as const) {
        const tab = button(name, () => {
          view = name;
          if (name === '执行' && !store.operation && !store.selectedEvent) {
            const latest = store.events
              .filter((event) => event.kind === 'operation.started')
              .at(-1);
            if (latest) {
              store.operation = eventKey(latest);
              store.step = 0;
            }
          }
          graphPage = 0;
          render();
        });
        tab.setAttribute('aria-pressed', String(view === name));
        nav.append(tab);
      }
      shell.append(nav);
      const note = el('p');
      note.className = 'notice';
      more.append(note);
      const main = el('main');
      shell.append(main);
      mounted = { shell, header, picker, status, nav, note, main };
      picker.onblur = updateDirectory;
      root.replaceChildren(style, shell);
    }
    updateDirectory();
    const setText = (node: HTMLElement, text: string) => {
      if (node.textContent !== text) node.textContent = text;
    };
    setText(
      mounted.status,
      `${message} · ${selected ? store.events.length : history.events.length} 条已保留事实 · 连接 / 缓存缺失 ${selected ? store.dropped : history.dropped} 条`,
    );
    const controls = mounted.header.querySelectorAll('button');
    setText(controls[1]!, running ? '断开连接' : '重新连接');
    for (const tab of mounted.nav.querySelectorAll('button'))
      tab.setAttribute('aria-pressed', String(tab.textContent === view));
    setText(
      mounted.note,
      `选择：${store.selection ?? '未选择'} · 元数据版本 ${store.revision}${store.stale ? '（已有后续变化，可刷新）' : ''}。静态关系表示潜在影响；缺失事件不代表未执行。`,
    );
    // 每个视图只依赖它消费的数据。后台状态/事件更新不重新创建无关控件或关系图。
    const nextKey = JSON.stringify([
      view,
      zoom,
      actual,
      store.operation,
      selected?.ref,
      store.revision,
      store.rows.length,
      store.selection,
      view === '关系'
        ? [full, [...collapsed], graphPage, store.events.length, store.events.at(-1)?.ref]
        : view === '执行'
          ? [
              store.selectedEvent,
              store.events.length,
              store.events.at(-1)?.ref,
              store.step,
              graphPage,
              captureSummary,
            ]
          : view === '状态'
            ? [statePage, values]
            : [store.events.length, store.events.at(-1)?.ref, values],
    ]);
    if (nextKey === mainKey) return;
    const focused = document.activeElement;
    if (!forceMain && focused instanceof HTMLSelectElement && mounted.main.contains(focused)) {
      focused.addEventListener('blur', scheduleRender, { once: true });
      return;
    }
    mainKey = nextKey;
    const main = el('main');
    if (!selected) {
      const empty = el('section');
      empty.className = 'observer-empty';
      empty.append(
        el('h2', '等待表单'),
        el('p', '在页面打开表单后，这里会自动显示关系图。修改表单即可查看执行路径，无需开启录制。'),
      );
      main.append(empty);
    }
    if (selected && (view === '关系' || view === '执行')) {
      const operation = el('select');
      operation.setAttribute('aria-label', '操作范围');
      const all = el('option', '全部已保留操作');
      all.value = '';
      operation.append(all);
      for (const event of store.events.filter((event) => event.kind === 'operation.started')) {
        const option = el(
          'option',
          `${({ dispatch: '修改表单', replaceContext: '上下文变化', validate: '主动校验', initialize: '初始化' } as Record<string, string>)[(event.payload as { source: string }).source] ?? '操作'} #${event.ref.sequence}`,
        );
        option.value = eventKey(event);
        operation.append(option);
      }
      operation.value = store.operation ?? '';
      operation.onchange = () => {
        store.operation = operation.value || undefined;
        graphPage = 0;
        store.step = 0;
        render(true);
      };
      if (view === '关系') main.append(operation);
      main.append(
        button('缩小', () => {
          zoom = Math.max(0.4, zoom - 0.2);
          render();
        }),
        button('放大', () => {
          zoom = Math.min(1.6, zoom + 0.2);
          render();
        }),
      );
      const affected = store.affectedMembers();
      main.append(
        el(
          'p',
          `已观测影响至少 ${affected.size} 个成员 · 未出现事件的成员不能据此判定未受影响 · 当前窗口缺失 ${store.dropped} 条`,
        ),
      );
    }
    if (selected && view === '关系') {
      main.append(
        button(full ? '完整影响链' : '直接上下游', () => {
          full = !full;
          render();
        }),
      );
      main.append(
        button(actual ? '已观测实际影响' : '潜在依赖', () => {
          actual = !actual;
          graphPage = 0;
          render();
        }),
      );
      const relation = actual ? store.actualRelationships() : store.relationships();
      const controls = el('details');
      controls.className = 'observer-controls';
      controls.append(el('summary', '对象展开与折叠'));
      for (const node of foldGraph(relation, collapsed)
        .nodes.filter(
          (n) =>
            (n.kind === 'array' || n.kind === 'object') && (!n.member || n.id === store.selection),
        )
        .slice(0, 200))
        controls.append(
          button(`${collapsed.has(node.id) ? '展开' : '折叠'} ${node.label}`, () => {
            if (collapsed.has(node.id)) collapsed.delete(node.id);
            else collapsed.add(node.id);
            render();
          }),
        );
      const members = el('select');
      members.setAttribute('aria-label', '展开数组成员');
      members.append(el('option', '选择成员，展开 Reaction / 校验'));
      const affected = store.affectedMembers();
      for (const row of store.rows.filter(
        (row) =>
          row.record === 'location' &&
          row.kind === 'object' &&
          typeof row.member === 'string' &&
          object(row.location) &&
          row.location.path === '',
      )) {
        const option = el(
          'option',
          `${row.path} · ${affected.has(String(row.member)) ? [...affected.get(String(row.member))!].join(' / ') || '已观测影响' : '影响未知'}`,
        );
        option.value = `location:${row.id}`;
        members.append(option);
      }
      members.onchange = () => {
        let id: string | undefined = members.value;
        const visited = new Set<string>();
        while (id && !visited.has(id)) {
          visited.add(id);
          collapsed.delete(id);
          id = relation.nodes.find((node) => node.id === id)?.parent;
        }
        store.selection = members.value;
        graphPage = Math.max(
          0,
          Math.floor(
            foldGraph(relation, collapsed).nodes.findIndex((node) => node.id === members.value) /
              120,
          ),
        );
        render(true);
      };
      if (members.options.length > 1) main.append(members);
      main.append(controls, graph(relation));
    } else if (selected && view === '执行') {
      const events = store.executionEvents();
      if (captureSummary) main.append(el('p', captureSummary));
      main.append(
        el(
          'p',
          '实线表示已知关联，虚线表示生命周期或消费关联，不能据此推断业务因果。缺少开始或终态时保留未知。',
        ),
      );
      const slider = el('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = String(events.length);
      slider.value = String(store.step);
      slider.setAttribute('aria-label', '执行步进');
      slider.onchange = () => {
        store.step = Number(slider.value);
        render();
      };
      main.append(
        button('上一步', () => {
          store.step = Math.max(0, store.step - 1);
          render();
        }),
        slider,
        button('下一步', () => {
          store.step = Math.min(events.length, store.step + 1);
          render();
        }),
        el('span', `${store.step} / ${events.length}`),
      );
      main.append(graph(store.execution(), true));
    } else if (selected && view === '状态') {
      main.append(el('p', '固定快照状态；不会用迟到工作事件覆盖当前来源。值只在明确检查时读取。'));
      const table = el('table');
      const stateRows = store.rows.filter((r) =>
        [
          'location',
          'reaction-instance',
          'validation-source',
          'validation-work',
          'validation-call',
          'validation-issue',
          'renderer-view',
          'renderer-material',
        ].includes(String(r.record)),
      );
      const pages = Math.max(1, Math.ceil(stateRows.length / 200));
      statePage = Math.min(statePage, pages - 1);
      main.append(
        button('上一页状态', () => {
          statePage = Math.max(0, statePage - 1);
          render();
        }),
        el('span', `${statePage + 1} / ${pages} 页 · 共 ${stateRows.length} 条元数据`),
        button('下一页状态', () => {
          statePage = Math.min(pages - 1, statePage + 1);
          render();
        }),
      );
      for (const row of stateRows.slice(statePage * 200, (statePage + 1) * 200)) {
        const tr = el('tr');
        const id = row.entityId
          ? `entity:${row.entityId}`
          : row.record === 'location'
            ? `location:${row.id}`
            : undefined;
        tr.append(
          el('td', String(row.ruleId ?? row.path ?? row.record)),
          el('td', String(row.status ?? row.phase ?? row.lifecycle ?? row.valueType ?? '')),
        );
        const action = el('td');
        if (id)
          action.append(
            button('定位', () => {
              store.selection = id;
              store.selectedEvent = undefined;
              values = undefined;
              view = '关系';
              const folded = foldGraph(store.relationships(), collapsed);
              graphPage = Math.max(
                0,
                Math.floor(folded.nodes.findIndex((n) => n.id === folded.representative(id)) / 120),
              );
              render();
            }),
          );
        if (row.record === 'location')
          action.append(
            button(
              '检查值',
              () =>
                void enqueue(async () => {
                  if (!session || !object(row.location)) return;
                  const head = store.rows.find((r) => r.record === 'header');
                  if (!object(head?.inputVersion)) return;
                  const value = await query({
                    op: 'inspectValue',
                    ...target(),
                    location: row.location as { path: string; member?: string },
                    expectedVersion: head.inputVersion as {
                      dataRevision: number;
                      contextRevision: number;
                    },
                  });
                  values = JSON.stringify(value, null, 2);
                }),
            ),
          );
        tr.append(action);
        table.append(tr);
      }
      main.append(table);
      if (values) main.append(el('pre', values));
    } else if (selected) {
      const diagnostics = store.events.filter(
        (e) =>
          e.kind === 'diagnostic' ||
          (object(e.payload) &&
            [
              'error',
              'partial-error',
              'condition-error',
              'invalid',
              'incomplete',
              'rejected',
              'cancelled',
            ].includes(
              String(
                (e.payload as Record<string, unknown>).outcome ??
                  (e.payload as Record<string, unknown>).status,
              ),
            )),
      );
      main.append(
        el(
          'p',
          `诊断 / 异常事实 ${diagnostics.length} 条；完整异常现场继续由原 Host 诊断出口交付。`,
        ),
      );
      for (const event of diagnostics) {
        const item = el('details');
        item.append(
          el('summary', `${event.ref.sequence} · ${event.kind}`),
          el('pre', JSON.stringify(event.payload, null, 2)),
        );
        item.append(
          button('定位执行', () => {
            store.operation = undefined;
            store.selectedEvent = eventKey(event);
            const payload: unknown = event.payload;
            const entity =
              object(payload) &&
              (object(payload.source)
                ? payload.source
                : object(payload.instance)
                  ? payload.instance
                  : undefined);
            store.selection =
              entity && typeof entity.entityId === 'string'
                ? `entity:${entity.entityId}`
                : undefined;
            view = '执行';
            graphPage = Math.max(
              0,
              Math.floor(
                store.execution().nodes.findIndex((node) => node.id === store.selectedEvent) / 120,
              ),
            );
            render();
          }),
        );
        item.append(
          button(
            '查询现场可用性',
            () =>
              void enqueue(async () => {
                if (!session) return;
                const evidence = await query({
                  op: 'locateEvidence',
                  ...target(),
                  event: event.ref,
                });
                values = JSON.stringify(evidence, null, 2);
              }),
          ),
        );
        main.append(item);
      }
    }
    if (view === '诊断' && values) main.append(el('pre', `现场可用性：${values}`));
    const body = el('div');
    body.className = 'observer-view-body';
    body.append(...main.childNodes);
    const heading = el('div');
    heading.className = 'observer-heading';
    heading.append(
      el('h2', `${view}视图`),
      el(
        'p',
        {
          关系: '查看字段、Reaction 与校验的依赖，选择节点聚焦影响范围。',
          执行: '跟随一次操作的真实执行事实，逐步查看条件、联动与异步结果。',
          状态: '查看当前元数据与校验状态，业务值仅在检查时读取。',
          诊断: '从异常事实定位执行路径，并检查原始现场是否仍然可用。',
        }[view],
      ),
    );
    const detail = el('aside');
    detail.className = 'observer-detail';
    detail.append(el('span', '节点详情'));
    for (const name of ['状态', '诊断'] as const)
      detail.append(
        button(name, () => {
          view = name;
          graphPage = 0;
          render();
        }),
      );
    const technical = (value: unknown) => {
      const item = el('details');
      item.append(el('summary', '技术信息'), el('pre', JSON.stringify(value, null, 2)));
      return item;
    };
    const selectedEvent = store.events.find((event) => eventKey(event) === store.selectedEvent);
    if (selectedEvent) {
      detail.append(
        el('h3', selectedEvent.kind),
        el(
          'p',
          String(
            (selectedEvent.payload as unknown as Record<string, unknown>).outcome ??
              (selectedEvent.payload as unknown as Record<string, unknown>).status ??
              '已记录执行事实',
          ),
        ),
        technical(selectedEvent.payload),
      );
      if (selectedEvent.kind === 'renderer.request') {
        detail.append(el('p', '请求业务因果：Host 未提供显式关联；Runtime / View 为归属关系。'));
        for (const [name, ref] of [
          ['Runtime', selectedEvent.payload.runtime],
          ['View', selectedEvent.payload.view],
          ['物料', selectedEvent.ref],
        ] as const) {
          const producer = producers.find(
            (producer) =>
              producer.ref.producerId === ref?.producerId && producer.ref.epoch === ref?.epoch,
          );
          if (producer)
            detail.append(button(`查看 ${name}`, () => void enqueue(() => select(producer))));
        }
      }
    }
    const historical = [...store.tombstones.values()].find(
      (row) =>
        `entity:${row.entityId}` === store.selection || `location:${row.id}` === store.selection,
    );
    if (historical)
      detail.append(
        el('h3', String(historical.ruleId ?? historical.path)),
        el('p', '当前已删除 · 仅保留历史元数据'),
        technical(historical),
      );

    const selectedNode = store.relationships().nodes.find((n) => n.id === store.selection);
    detail.append(el('h3', selectedNode?.label ?? (historical ? '历史对象' : '选择一个节点')));
    detail.append(
      el(
        'p',
        selectedNode
          ? `${selectedNode.kind} · ${selectedNode.status ?? '状态见当前快照'}`
          : '在图中选择 Reaction 或校验，切换视图时保留同一对象。',
      ),
    );
    if (selectedNode) {
      detail.append(technical({ id: selectedNode.id }));
      const relation = store.relationships();
      for (const [title, nodes] of [
        ['直接上游', relation.edges.filter((e) => e.to === selectedNode.id).map((e) => e.from)],
        ['直接下游', relation.edges.filter((e) => e.from === selectedNode.id).map((e) => e.to)],
      ] as const) {
        detail.append(el('h4', `${title} · ${new Set(nodes).size}`));
        for (const id of [...new Set(nodes)].slice(0, 8)) {
          const node = relation.nodes.find((n) => n.id === id);
          if (node)
            detail.append(
              button(node.label, () => {
                store.selection = id;
                values = undefined;
                render();
              }),
            );
        }
        if (nodes.length > 8) detail.append(el('p', '其余关联可在影响链中查看。'));
      }
    }
    detail.append(el('p', '连接前未观测的路径保持未知；当前快照不会补造历史。'));
    const content = el('div');
    content.className = 'observer-content';
    let operationRail: HTMLElement | undefined;
    if (selected && view === '执行') {
      content.classList.add('observer-execution');
      operationRail = el('aside');
      operationRail.className = 'observer-operations';
      const operations = store.events.filter((event) => event.kind === 'operation.started');
      operationRail.append(
        el('h3', `操作记录 · ${operations.length}`),
        el('p', '按发生顺序排列 · 时间为页面计时'),
      );
      const tabs = el('div');
      tabs.className = 'operation-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.setAttribute('aria-label', '执行操作');
      tabs.setAttribute('aria-orientation', 'vertical');
      const targets = new Map<string, Set<string>>();
      for (const event of store.events)
        if (event.kind === 'data.changed' && event.payload.operation) {
          const ref = event.payload.operation,
            key = `${ref.producerId}:${ref.epoch}:${ref.sequence}`;
          if (!targets.has(key)) targets.set(key, new Set());
          targets.get(key)!.add(event.payload.path || '表单根节点');
        }
      const entries = [
        { key: '', title: '全部已保留操作', meta: '查看完整观测窗口' },
        ...operations.map((event, index) => ({
          key: eventKey(event),
          title: `#${event.ref.sequence} · ${({ dispatch: '修改表单', replaceContext: '更新上下文', validate: '主动校验', initialize: '初始化' } as Record<string, string>)[event.payload.source] ?? '操作'}`,
          meta: `${event.monotonicTime === undefined ? '时间未上报' : `+${(event.monotonicTime / 1000).toFixed(3)}s`}${index === operations.length - 1 ? ' · 最新' : ''}`,
        })),
      ];
      entries.forEach((entry, index) => {
        const tab = button('', () => {
          store.operation = entry.key || undefined;
          store.selectedEvent = undefined;
          store.step = 0;
          graphPage = 0;
          render(true);
        });
        tab.className = 'operation-tab';
        tab.id = `operation-tab-${index}`;
        tab.setAttribute('data-operation', entry.key);
        tab.setAttribute('role', 'tab');
        tab.setAttribute('aria-selected', String(entry.key === (store.operation ?? '')));
        tab.setAttribute('aria-controls', 'operation-execution-panel');
        tab.tabIndex = entry.key === (store.operation ?? '') ? 0 : -1;
        tab.append(el('strong', entry.title), el('span', entry.meta));
        const fields = targets.get(entry.key);
        if (fields?.size) {
          const summary = el(
            'span',
            [...fields].slice(0, 2).join('、') + (fields.size > 2 ? ` 等 ${fields.size} 处` : ''),
          );
          summary.title = [...fields].join('\n');
          tab.append(summary);
        }
        tab.onkeydown = (event) => {
          const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
          const next =
            event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1 : index + direction;
          if (direction || event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const target =
              tabs.querySelectorAll<HTMLButtonElement>('[role=tab]')[
                Math.max(0, Math.min(entries.length - 1, next))
              ]!;
            target.focus();
            target.click();
          }
        };
        if (entry.key === (store.operation ?? '')) body.setAttribute('aria-labelledby', tab.id);
        tabs.append(tab);
      });
      if (!operations.length) operationRail.append(el('p', '修改表单后，操作会自动出现在这里。'));
      if (store.dropped) operationRail.append(el('p', '窗口存在缺失；列表不是完整历史。'));
      operationRail.append(tabs);
      content.append(operationRail);
      body.id = 'operation-execution-panel';
      body.setAttribute('role', 'tabpanel');
    }
    content.append(body, detail);
    main.append(heading, content);

    const oldTabs = mounted.main.querySelector('.operation-tabs');
    const oldTabScroll = oldTabs?.scrollTop;
    const followTail =
      !oldTabs || oldTabs.scrollHeight - oldTabs.scrollTop - oldTabs.clientHeight < 8;
    const focusedOperation = doc.activeElement?.getAttribute('data-operation');
    const scroll = mounted.main.querySelector('.graph-scroll');
    const position = scroll ? { left: scroll.scrollLeft, top: scroll.scrollTop } : undefined;
    const expanded = [...mounted.main.querySelectorAll('details[open]')].map(
      (detail) => detail.querySelector('summary')?.textContent,
    );
    mounted.main.replaceWith(main);
    mounted.main = main;
    const nextTabs = main.querySelector('.operation-tabs');
    if (nextTabs) nextTabs.scrollTop = followTail ? nextTabs.scrollHeight : (oldTabScroll ?? 0);
    if (focusedOperation != null)
      [...main.querySelectorAll<HTMLButtonElement>('[data-operation]')]
        .find((tab) => tab.getAttribute('data-operation') === focusedOperation)
        ?.focus({ preventScroll: true });
    const nextScroll = main.querySelector('.graph-scroll');
    if (position && nextScroll) {
      nextScroll.scrollLeft = position.left;
      nextScroll.scrollTop = position.top;
    }
    const graphFocus = JSON.stringify([view, store.selection, store.selectedEvent]);
    const focusedNode = main.querySelector('[data-selected="true"]');
    if (nextScroll && focusedNode && lastGraphFocus !== graphFocus) {
      nextScroll.scrollLeft = Math.max(0, Number(focusedNode.getAttribute('data-x')) - 100);
      nextScroll.scrollTop = Math.max(0, Number(focusedNode.getAttribute('data-y')) - 100);
    }
    lastGraphFocus = graphFocus;
    for (const detail of main.querySelectorAll('details'))
      if (expanded.includes(detail.querySelector('summary')?.textContent)) detail.open = true;
  }
  render();
  connect();
  return () => {
    destroyed = true;
    running = false;
    generation++;
    unsubscribe?.();
    clearTimeout(renderTimer);
    void queue.then(close).catch(() => undefined);
    store.clear();
    history.clear();
    root.replaceChildren();
  };
}
