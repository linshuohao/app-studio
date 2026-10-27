import { DiagnosticHistory } from './diagnostic-history.js';
import type {
  DevtoolsEvent,
  DevtoolsHook,
  DevtoolsSource,
  DevtoolsSourceInfo,
  DevtoolsSnapshot,
} from './types.js';
import { copyForDevtools } from './snapshot.js';
interface Entry {
  readonly info: DevtoolsSourceInfo;
  readonly read: () => unknown;
  readonly diagnosticHistory?: DiagnosticHistory;
}
/**
 * 仅开发浏览器内存在的实例目录。没有连接时不保存通用事件；开发视图单独保留有界诊断，支持晚连接。
 * 工具通知使用独立微任务，不注册业务 observe，不参与 Flush 的通知预算与调用链。
 */
export class DevtoolsRegistry {
  readonly #ids = new WeakMap<object, string>();
  readonly #sources = new Map<string, Entry>();
  /** 同一根身份的模拟清理 / 重连保留窗口；弱关联不让已释放视图被目录长期持有。 */
  readonly #viewDiagnosticHistories = new WeakMap<object, DiagnosticHistory>();
  readonly #listeners = new Map<(event: DevtoolsEvent) => void, number>();
  #nextId = 0;
  #sequence = 0;
  #queue: DevtoolsEvent[] = [];
  #dropped = 0;
  #scheduled = false;
  readonly hook: DevtoolsHook = Object.freeze({
    version: 1,
    [Symbol.for('form-engine.devtools.register.1')]: (
      ...args: Parameters<DevtoolsRegistry['register']>
    ) => this.register(...args),
    list: () => Object.freeze([...this.#sources.values()].map((source) => source.info)),
    read: (id: string) => {
      try {
        const entry = this.#sources.get(id);
        if (!entry) return undefined;
        const state = entry.read();
        return copyForDevtools(
          entry.diagnosticHistory && state && typeof state === 'object' && !Array.isArray(state)
            ? { ...state, ...entry.diagnosticHistory.snapshot() }
            : state,
        );
      } catch (error) {
        return copyForDevtools({ error: String(error) });
      }
    },
    subscribe: (listener: (event: DevtoolsEvent) => void) => {
      this.#listeners.set(listener, this.#sequence);
      return () => {
        this.#listeners.delete(listener);
        if (!this.#listeners.size) {
          this.#queue = [];
          this.#dropped = 0;
        }
      };
    },
  });
  #id(owner: object): string {
    let id = this.#ids.get(owner);
    if (!id) {
      id = `fe-${++this.#nextId}`;
      this.#ids.set(owner, id);
    }
    return id;
  }
  register(
    owner: object,
    info: Omit<DevtoolsSourceInfo, 'id' | 'parentId'>,
    read: () => unknown,
    parent?: object,
  ): DevtoolsSource {
    const id = this.#id(owner);
    const diagnosticHistory =
      info.kind === 'view'
        ? (this.#viewDiagnosticHistories.get(owner) ?? new DiagnosticHistory())
        : undefined;
    if (diagnosticHistory) this.#viewDiagnosticHistories.set(owner, diagnosticHistory);
    const entry: Entry = {
      info: Object.freeze({ ...info, id, ...(parent ? { parentId: this.#id(parent) } : {}) }),
      read,
      ...(diagnosticHistory ? { diagnosticHistory } : {}),
    };
    this.#sources.set(id, entry);
    this.#publish(id, 'source-added');
    return {
      id,
      publish: (kind, payload) => {
        if (this.#sources.get(id) !== entry) return;
        const captured =
          kind === 'diagnostic' ? entry.diagnosticHistory?.record(payload) : undefined;
        this.#publish(id, kind, payload, captured);
      },
      dispose: () => {
        if (this.#sources.get(id) !== entry) return;
        this.#remove(id);
      },
    };
  }
  /** 父业务实例退出时清理整个工具子树，避免仍挂载的错误视图保留失效实例引用。 */
  #remove(id: string) {
    if (!this.#sources.delete(id)) return;
    for (const [childId, child] of this.#sources)
      if (child.info.parentId === id) this.#remove(childId);
    this.#publish(id, 'source-removed');
  }
  #publish(sourceId: string, kind: string, payload?: unknown, captured?: DevtoolsSnapshot) {
    if (!this.#listeners.size) return;
    const event = Object.freeze({
      sequence: ++this.#sequence,
      sourceId,
      kind,
      ...(payload === undefined ? {} : { payload: captured ?? copyForDevtools(payload) }),
      dropped: 0,
    });
    if (this.#queue.length === 200) {
      this.#queue.shift();
      this.#dropped++;
    }
    this.#queue.push(event);
    if (this.#scheduled) return;
    this.#scheduled = true;
    void Promise.resolve().then(() => {
      this.#scheduled = false;
      const queue = this.#queue;
      const dropped = this.#dropped;
      this.#queue = [];
      this.#dropped = 0;
      for (const event of queue)
        for (const [listener, since] of [...this.#listeners]) {
          if (!this.#listeners.has(listener) || event.sequence <= since) continue;
          try {
            Promise.resolve(
              listener(Object.freeze({ ...event, dropped: event === queue[0] ? dropped : 0 })),
            ).catch(() => undefined);
          } catch {
            /* 工具失败不回写业务诊断，也不影响其他工具。 */
          }
        }
    });
  }
}
