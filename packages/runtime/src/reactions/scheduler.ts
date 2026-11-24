import type { FlushOutcome } from '../types.js';
import { DiagnosticReporter } from '../diagnostics/reporter.js';
import { FlushContext } from './context.js';

/**
 * Runtime 实例的 Reaction 调度器：微任务启动 drain，先清空联动队列，再进入校验。
 * 同步校验发布结果后若再次触发联动，仍在本轮继续执行，共享本轮预算。
 * Host 异步任务不在这里等待；异步结果回到 Runtime 后另行触发调度。
 */
export class ReactionScheduler {
  /** 规则 + Scope 实例键去重；执行前移除键，因此执行中再次失效可重新入队。 */
  private pending = new Map<string, { id: number; execute: (id: number) => void }>();
  private queueSequence = 0;
  /** 已预约微任务但尚未开始 drain，用来合并同一同步调用栈中的调度请求。 */
  private scheduled = false;
  /** 正在执行的单轮上下文；结束即解除引用，期间新增任务直接进入本轮队列。 */
  private context?: FlushContext;
  /** 实例终止标记；与只中断当前轮次的 aborted 不同。 */
  private disposed = false;
  /** 已启动的 drain 轮次，跨 flush 调用递增；空闲时调用 flush 不增加轮次。 */
  private round = 0;
  /** 等待当前已预约 / 正在执行轮次结束的 flush 调用者，不等待 Host 异步任务。 */
  private waiters: Array<(outcome: FlushOutcome) => void> = [];
  /** 最近一轮的完成结果；空闲时 flush 直接返回它。 */
  private last: FlushOutcome = { round: 0, status: 'settled', executions: 0 };
  /** 接入执行预算、校验阶段和诊断出口；构造本身不启动新轮次。 */
  constructor(
    /** 本轮执行上限；Reaction 执行数与同步校验反馈次数分别计数。 */
    private readonly maximum: number,
    /** Reaction 队列排空后的校验入口；返回是否仍有同步校验待执行。 */
    private readonly afterReactions: () => boolean,
    /** 实例诊断出口；只在 drain 期间接入本轮临时 Journal。 */
    private readonly diagnostics: DiagnosticReporter,
    private readonly discarded?: (
      id: number,
      reason: 'source-removed' | 'aborted' | 'runtime-disposed',
    ) => void,
  ) {}
  /** 合并尚未执行的同键任务，并确保存在一次延迟调度；运行中入队属于本轮。 */
  enqueue(key: string, execute: (id: number) => void) {
    if (this.disposed) return;
    const previous = this.pending.get(key);
    const id = previous?.id ?? ++this.queueSequence;
    this.pending.set(key, { id, execute });
    this.schedule();
    return { id, merged: !!previous };
  }
  /** 成员 / 规则实例销毁时移除其待执行任务，不影响其他实例。 */
  remove(key: string) {
    const task = this.pending.get(key);
    this.pending.delete(key);
    if (task) this.reportDiscard(task.id, 'source-removed');
  }
  private reportDiscard(id: number, reason: 'source-removed' | 'aborted' | 'runtime-disposed') {
    try {
      this.discarded?.(id, reason);
    } catch {
      /* 观测失败不改变队列。 */
    }
  }
  private clearPending(reason: 'aborted' | 'runtime-disposed') {
    const pending = this.pending;
    this.pending = new Map();
    for (const task of pending.values()) this.reportDiscard(task.id, reason);
  }
  /** 投递发生在活动轮次时共享其保护；尚未开始时由 Registry 约束本次同步投递。 */
  consumeNotification(generation: number): boolean {
    return this.context?.consumeNotification(generation) ?? true;
  }
  /** 停止不可收敛的同步通知反馈，清空本轮待执行规则，不建立虚假新轮次。 */
  abortNotifications(): void {
    if (this.context) {
      this.context.abort();
      this.clearPending('aborted');
    }
    this.diagnostics.error(
      this.context ? 'flush.aborted' : 'notification.aborted',
      Error('Synchronous notification feedback budget exhausted'),
      this.diagnostics.captureExecution('notification.abort'),
    );
  }
  /** 动作 / batch 边界也必须尊重通知回调引发的本轮停止。 */
  hasAborted(): boolean {
    return this.context?.hasAborted() ?? false;
  }
  /** 在微任务预约一次 drain；运行中由现有循环继续处理，无需另开轮次。 */
  schedule() {
    if (this.disposed || this.context || this.scheduled) return;
    this.scheduled = true;
    void Promise.resolve().then(() => {
      if (!this.disposed) this.drain();
    });
  }
  /** 等待已有调度收敛；本方法本身不创建新一轮，也不启动完整校验。 */
  flush(): Promise<FlushOutcome> {
    if (this.disposed) return Promise.resolve({ ...this.last, status: 'disposed' });
    if (!this.scheduled && !this.context) return Promise.resolve(this.last);
    return new Promise((resolve) => this.waiters.push(resolve));
  }
  /** 同步消费联动与校验反馈直至收敛、熔断或销毁，最后统一返回本轮结果。 */
  private drain() {
    this.scheduled = false;
    const context = new FlushContext(
      ++this.round,
      this.maximum,
      this.diagnostics.capacity,
      this.diagnostics.takeTriggers(),
    );
    this.context = context;
    this.diagnostics.begin(context.round, context.journal);
    this.diagnostics.record('flush.start');
    try {
      for (;;) {
        while (this.pending.size && !this.disposed) {
          const [key, task] = this.pending.entries().next().value!;
          if (!context.consumeReaction(key)) {
            // 熔断只丢弃本轮剩余任务；下一次交互仍可 enqueue / schedule。
            this.clearPending('aborted');
            this.diagnostics.error(
              'flush.aborted',
              Error(`Execution budget exhausted before ${key}`),
              this.diagnostics.captureExecution('flush.abort'),
            );
            break;
          }
          this.pending.delete(key);
          try {
            task.execute(task.id);
          } catch (error) {
            this.diagnostics.error('reaction.error', error);
          }
        }
        if (context.hasAborted() || this.disposed) break;
        // 校验可能同步发布状态并再次入队 Reaction，所以必须回到外层循环检查。
        const validationPending = this.afterReactions();
        if (!context.completeValidation(validationPending)) {
          this.clearPending('aborted');
          this.diagnostics.error(
            'flush.aborted',
            Error('Synchronous validation feedback budget exhausted'),
            this.diagnostics.captureExecution('flush.abort'),
          );
          break;
        }
        if (!this.pending.size && !validationPending) break;
      }
    } catch (error) {
      this.diagnostics.error('flush.error', error);
      context.abort();
      this.clearPending('aborted');
    } finally {
      this.last = context.outcome(this.disposed);
      this.diagnostics.record('flush.end', this.last.status);
      this.context = undefined;
      this.diagnostics.finish(this.last);
      this.waiters.splice(0).forEach((resolve) => resolve(this.last));
    }
  }
  /** 终止实例调度、清空待执行任务，并释放等待 flush 的调用者。 */
  dispose() {
    this.disposed = true;
    this.clearPending('runtime-disposed');
    this.diagnostics.discardTriggers();
    // 执行中销毁由 finally 输出本轮真实计数；尚未开始的轮次直接释放等待者。
    if (!this.context)
      this.waiters.splice(0).forEach((resolve) => resolve({ ...this.last, status: 'disposed' }));
  }
}
