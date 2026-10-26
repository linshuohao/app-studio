import { Journal } from '../diagnostics/journal.js';
import type { Diagnostic, FlushOutcome } from '../types.js';

/** 一轮同步调度的状态与事件记录；每次 drain 新建，不被异步任务捕获或跨轮复用。 */
export class FlushContext {
  /** 本轮临时记录，收敛 / 熔断后封存并释放，不参与预算判断。 */
  readonly journal: Journal;
  /** 已尝试执行的 Reaction 任务数，先计数再执行，失败也消耗预算。 */
  private executions = 0;
  /** 按规则 + Scope 实例累计，不能因重新入队而重置。 */
  private readonly instanceExecutions = new Map<string, number>();
  /** 本轮通知写回的最大反馈深度；普通并行订阅者不增加反馈深度。 */
  private notificationDepth = 0;
  /** 本轮同步校验阶段次数，与 Reaction 次数分别限制。 */
  private validationPasses = 0;
  /** 仅中止本轮；不表示整个 Runtime 已销毁。 */
  private aborted = false;

  /** 由 Scheduler 分配轮次并移交调度前来源，记录容量不影响 maximum。 */
  constructor(
    readonly round: number,
    private readonly maximum: number,
    capacity: number,
    triggers: { readonly entries: readonly Diagnostic[]; readonly truncated: boolean },
    private readonly maximumPerInstance = maximum,
  ) {
    this.journal = new Journal(capacity, triggers.entries, triggers.truncated);
  }

  /** 执行前申请一次 Reaction 预算；达到上限时标记本轮中止。 */
  consumeReaction(key: string): boolean {
    const count = this.instanceExecutions.get(key) ?? 0;
    if (this.aborted || this.executions >= this.maximum || count >= this.maximumPerInstance) {
      this.abort();
      return false;
    }
    this.executions++;
    this.instanceExecutions.set(key, count + 1);
    return true;
  }

  /** 在可重入队列边界检查写回深度，避免把正常通知扇出误判成反馈循环。 */
  consumeNotification(generation: number): boolean {
    this.notificationDepth = Math.max(this.notificationDepth, generation + 1);
    return !this.aborted && this.notificationDepth <= this.maximum;
  }

  /** 完成一次校验阶段；只有仍有同步校验待执行时才应用反馈次数上限。 */
  completeValidation(pending: boolean): boolean {
    this.validationPasses++;
    if (pending && this.validationPasses >= this.maximum) {
      this.abort();
      return false;
    }
    return true;
  }

  /** 技术异常或执行预算耗尽时中止本轮，后续轮次会使用全新计数。 */
  abort(): void {
    this.aborted = true;
  }

  /** 读取本轮停止标志，不为循环检查构造结束报告。 */
  hasAborted(): boolean {
    return this.aborted;
  }

  /** 按实例生命周期和本轮状态产生不可变结束结果，不保留上下文引用。 */
  outcome(disposed: boolean): FlushOutcome {
    return Object.freeze({
      round: this.round,
      status: disposed ? 'disposed' : this.aborted ? 'aborted' : 'settled',
      executions: this.executions,
    });
  }
}
