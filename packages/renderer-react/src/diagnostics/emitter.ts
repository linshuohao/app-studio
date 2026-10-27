import type { RendererDiagnostic } from './types.js';
/**
 * 面向任意消费者的诊断发布器，不传输业务状态，也不保存 DevTools 历史。
 * 后代错误可能早于根提交；此时暂存，根建立全部订阅后显式 flushPending 完整交付。
 */
export class DiagnosticEmitter {
  readonly #listeners = new Set<(diagnostic: RendererDiagnostic) => void>();
  #pending: RendererDiagnostic[] = [];
  report = (diagnostic: RendererDiagnostic) => {
    const entry = Object.freeze(diagnostic);
    if (!this.#listeners.size) this.#pending.push(entry);
    else
      for (const listener of [...this.#listeners]) {
        if (this.#listeners.has(listener)) this.#deliver(listener, entry);
      }
  };
  /** 只订阅未来发布；初次队列由根统一交接，避免第一个消费者独占初始错误。 */
  subscribe = (listener: (diagnostic: RendererDiagnostic) => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  /** 先取走队列，再交付全部现有消费者；重入发布不会重复消费这批错误。 */
  flushPending = () => {
    if (!this.#listeners.size) return;
    const pending = this.#pending;
    this.#pending = [];
    for (const entry of pending)
      for (const listener of [...this.#listeners]) {
        if (this.#listeners.has(listener)) this.#deliver(listener, entry);
      }
  };
  #deliver(listener: (diagnostic: RendererDiagnostic) => void, entry: RendererDiagnostic) {
    try {
      Promise.resolve(listener(entry)).catch(() => undefined);
    } catch {
      /* 消费者失败不影响业务或其他消费者。 */
    }
  }
}
