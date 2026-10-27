import type { DevtoolsSnapshot } from './types.js';
import { copyForDevtools } from './snapshot.js';
/** 开发观测专用的诊断窗口。与 Host 错误交付分离，注销后不可查询，弱关联随根上下文释放；默认产物不建立。 */
export class DiagnosticHistory {
  readonly #entries: unknown[] = [];
  #truncated = false;
  record(diagnostic: unknown): DevtoolsSnapshot {
    const snapshot = copyForDevtools(diagnostic);
    if (this.#entries.length === 100) {
      this.#entries.shift();
      this.#truncated = true;
    }
    this.#truncated ||= snapshot.truncated;
    this.#entries.push(snapshot.value);
    return snapshot;
  }
  snapshot() {
    return { diagnostics: this.#entries.slice(), diagnosticsTruncated: this.#truncated };
  }
}
