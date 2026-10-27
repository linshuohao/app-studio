import type { DevtoolsEvent, DevtoolsHook } from '@form-engine/runtime/devtools';
import type { PageCommand, PageReply } from './types.js';
/**
 * 在 inspectedWindow 的页面世界执行，必须自包含，不能引用模块闭包或浏览器扩展对象。
 * 只消费发现接口。每个面板独立缓冲 / 选择，停止或 15 秒租约到期后撤销订阅。
 * 无 Hook 时不创建 Hook；所以安装扩展不能使生产引擎开启采集。
 */
export function pageRequest(command: PageCommand): PageReply {
  const empty = (status: PageReply['status']): PageReply => ({
    status,
    sources: [],
    events: [],
    dropped: 0,
  });
  const host = globalThis as unknown as Record<string, unknown>;
  const candidate = host.__FORM_ENGINE_DEVTOOLS__ as DevtoolsHook | undefined;
  if (!candidate) return empty('waiting');
  if (
    candidate.version !== 1 ||
    typeof candidate.list !== 'function' ||
    typeof candidate.read !== 'function' ||
    typeof candidate.subscribe !== 'function'
  )
    return empty('incompatible');
  type Session = {
    hook: DevtoolsHook;
    dispose: () => void;
    timer: ReturnType<typeof setTimeout>;
    events: DevtoolsEvent[];
    dropped: number;
    selectedId?: string;
  };
  const key = '__FORM_ENGINE_DEVTOOLS_SESSIONS_V1__';
  let sessions = host[key] as Map<string, Session> | undefined;
  if (!sessions) {
    sessions = new Map();
    Object.defineProperty(host, key, { value: sessions, configurable: true });
  }
  const collection = sessions;
  const remove = (id: string) => {
    const session = collection.get(id);
    if (!session) return;
    collection.delete(id);
    clearTimeout(session.timer);
    session.dispose();
    session.events = [];
  };
  if (
    !command ||
    typeof command.session !== 'string' ||
    command.session.length > 128 ||
    !['poll', 'inspect', 'disconnect'].includes(command.op)
  )
    return empty('waiting');
  if (command.op === 'disconnect') {
    remove(command.session);
    return empty('waiting');
  }
  let session = sessions.get(command.session);
  if (session && session.hook !== candidate) {
    remove(command.session);
    session = undefined;
  }
  if (!session) {
    if (sessions.size >= 8) remove(sessions.keys().next().value!);
    const created: Session = {
      hook: candidate,
      dispose: () => undefined,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
      events: [],
      dropped: 0,
    };
    created.dispose = candidate.subscribe((event) => {
      if (created.events.length === 100) {
        created.events.shift();
        created.dropped++;
      }
      created.events.push(event);
    });
    session = created;
    sessions.set(command.session, session);
  }
  clearTimeout(session.timer);
  session.timer = setTimeout(() => remove(command.session), 15_000);
  if (command.op === 'inspect' && typeof command.id === 'string') session.selectedId = command.id;
  const events = session.events;
  const dropped = session.dropped;
  session.events = [];
  session.dropped = 0;
  return {
    status: 'connected',
    sources: candidate.list(),
    events,
    dropped,
    ...(session.selectedId
      ? { selectedId: session.selectedId, snapshot: candidate.read(session.selectedId) }
      : {}),
  };
}
