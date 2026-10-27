import type { DevtoolsEvent } from '@form-engine/runtime/devtools';
import type { DevtoolsTransport, PageCommand, PageReply } from '../bridge/types.js';
import { sourceList } from './source-list.js';
import { snapshotView } from './snapshot-view.js';
import { eventList } from './event-list.js';
/**
 * 独立工具界面：DOM、计时器和最多 100 条事件全归工具，不进入业务组件树。
 * 返回 destroy；停止连接 / 销毁会撤销页面订阅、清空副本，丢失关闭通知时由页面租约兜底。
 */
export function mountDevtools(root: HTMLElement, transport: DevtoolsTransport) {
  const document = root.ownerDocument;
  let running = true,
    destroyed = false,
    timer: ReturnType<typeof setTimeout> | undefined;
  let revision = 0,
    events: DevtoolsEvent[] = [],
    dropped = 0,
    selectedId: string | undefined;
  let session = crypto.randomUUID();
  const header = document.createElement('header');
  const title = document.createElement('h1');
  title.textContent = 'Form Engine';
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  status.textContent = '正在连接…';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = '断开连接';
  header.append(title, status, toggle);
  const body = document.createElement('div');
  body.className = 'inspector';
  root.replaceChildren(header, body);
  const show = (reply: PageReply) => {
    status.textContent =
      reply.status === 'connected'
        ? `已连接 · ${reply.sources.length} 个对象`
        : reply.status === 'waiting'
          ? '等待支持开发观测的页面（生产构建不提供发现入口）'
          : '观测协议版本不兼容';
    dropped += reply.dropped;
    for (const event of reply.events) {
      if (events.length === 100) {
        events.shift();
        dropped++;
      }
      dropped += event.dropped;
      events.push(event);
    }
    selectedId = reply.selectedId;
    const content = document.createElement('main');
    content.append(snapshotView(document, reply.snapshot), eventList(document, events, dropped));
    body.replaceChildren(
      sourceList(document, reply.sources, selectedId, (id) => {
        void request('inspect', id);
      }),
      content,
    );
  };
  // 页面每次回复会移交并清空事件，因此同一连接内串行消费所有回复，不能因新点击丢掉旧轮询。
  let queue: Promise<void> = Promise.resolve();
  const request = (op: PageCommand['op'], id?: string): Promise<void> => {
    const generation = revision;
    queue = queue.then(async () => {
      if (destroyed || !running || generation !== revision) return;
      try {
        const reply = await transport.request({ op, session, ...(id ? { id } : {}) });
        if (!destroyed && running && generation === revision) show(reply);
      } catch (error) {
        if (!destroyed && generation === revision)
          status.textContent = `连接失败：${String(error)}`;
      }
    });
    return queue;
  };
  const poll = async () => {
    const generation = revision;
    await request('poll');
    if (running && !destroyed && generation === revision)
      timer = setTimeout(() => {
        void poll();
      }, 1_000);
  };
  toggle.addEventListener('click', async () => {
    toggle.disabled = true;
    if (running) {
      running = false;
      revision++;
      clearTimeout(timer);
      try {
        await transport.request({ op: 'disconnect', session });
      } catch {
        /* 页面租约会释放失联连接。 */
      }
      events = [];
      dropped = 0;
      selectedId = undefined;
      body.replaceChildren();
      status.textContent = '已断开；工具缓存已清空';
      toggle.textContent = '连接';
    } else {
      session = crypto.randomUUID();
      running = true;
      toggle.textContent = '断开连接';
      void poll();
    }
    toggle.disabled = false;
  });
  void poll();
  return () => {
    destroyed = true;
    running = false;
    revision++;
    clearTimeout(timer);
    events = [];
    void transport.request({ op: 'disconnect', session }).catch(() => undefined);
    root.replaceChildren();
  };
}
