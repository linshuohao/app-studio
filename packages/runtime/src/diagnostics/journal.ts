import type {
  Diagnostic,
  DiagnosticOrigin,
  FlushDiagnosticReport,
  FlushOutcome,
} from '../types.js';

/** 有界追加并报告是否丢弃记录；0 表示关闭采集，执行预算不依赖此返回值。 */
export function retainDiagnostic(
  entries: Diagnostic[],
  entry: Diagnostic,
  capacity: number,
): boolean {
  if (!capacity) return true;
  entries.push(entry);
  if (entries.length <= capacity) return false;
  entries.shift();
  return true;
}

/**
 * 单轮调度的临时事件记录，由 FlushContext 创建，结束后封存并释放内部数组。
 * 实例诊断出口分配事件序号；异步任务仅捕获来源编号，不持有本 Journal。
 * 当前保留有限事件尾部及触发引用，尚非完整的 Command / Change 因果 Trace 协议。
 */
export class Journal {
  /** 本轮拥有的事件引用，含首次启动前已经发生的触发事件。 */
  private entries: Diagnostic[] = [];
  /** 只保留有界来源引用；对应事件可能被后续尾部截断，因此同时报告 truncated。 */
  private triggeredBy: readonly DiagnosticOrigin[];
  /** 来源或事件超过记录容量时置位；执行计数仍继续。 */
  private truncated: boolean;
  /** 封存后禁止追加，避免迟到任务继续修改旧轮次。 */
  private closed = false;

  /** 接管调度前有界来源；round 由所属 FlushContext 标识，不在这里分配轮次。 */
  constructor(
    private readonly capacity: number,
    triggers: readonly Diagnostic[] = [],
    truncated = false,
  ) {
    this.truncated = truncated;
    this.triggeredBy = Object.freeze(
      triggers.map(({ sequence, round }) =>
        Object.freeze({
          sequence,
          ...(round === undefined ? {} : { round }),
        }),
      ),
    );
    for (const entry of triggers) this.record(entry);
  }

  /** 记录已冻结的事件元数据；不保存业务值，不分配执行预算。 */
  record(entry: Diagnostic): void {
    if (this.closed) throw Error('diagnostics: round already closed');
    this.truncated = retainDiagnostic(this.entries, entry, this.capacity) || this.truncated;
  }

  /** 产生只读报告后释放内部引用；报告交给 Host，Runtime 不积累完整轮次历史。 */
  finish(outcome: FlushOutcome): FlushDiagnosticReport {
    if (this.closed) throw Error('diagnostics: round already closed');
    this.closed = true;
    const report = Object.freeze({
      kind: 'flush' as const,
      outcome: Object.freeze({ ...outcome }),
      entries: Object.freeze(this.entries),
      triggeredBy: this.triggeredBy,
      truncated: this.truncated,
    });
    this.entries = [];
    this.triggeredBy = [];
    return report;
  }
}
