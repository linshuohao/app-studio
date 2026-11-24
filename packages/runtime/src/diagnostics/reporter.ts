import type {
  Diagnostic,
  DiagnosticOrigin,
  FlushOutcome,
  RuntimeDiagnosticReport,
  DiagnosticInput,
  DiagnosticExecution,
  DiagnosticTrigger,
  DiagnosticEvidence,
  ReadonlyJson,
} from '../types.js';
import type { ReadonlyPreparedForm } from '@form-engine/protocol/prepared';
import { Journal, retainDiagnostic } from './journal.js';
import { copyJson } from '../data/json.js';
import { observeRejection } from '../lifecycle/async.js';

/** 执行元信息只持有不可变输入；异步任务可保留它，不会保留已结束的调度上下文。 */
export class ExecutionTrace {
  /** 实际读取的校验投影，按读取顺序保留，错误时封存。 */
  readonly validationReads: ReadonlyJson[] = [];
  /** 当次外部输入 / 返回值；只接管合法 JSON，错误现场封存当前值。 */
  parameters?: ReadonlyJson;
  /** 调用入口只保留输入事实与身份，不引用可变业务状态的拥有者。 */
  constructor(
    readonly ref: DiagnosticExecution,
    readonly input: DiagnosticInput,
    readonly invocationInput: DiagnosticInput | undefined,
    readonly triggers: readonly DiagnosticTrigger[],
    /** 子执行共享关联集合；调用结束仅删除编号，不保留调用对象。 */
    readonly calls = new Set<number>(),
  ) {}
}

/**
 * Runtime 实例诊断出口：维护轻量最近事件查询及调度前来源，向 Host 输出封存报告。
 * 不拥有长期轮次历史；active 仅在一次 drain 期间指向该轮 Journal。
 */
export class DiagnosticReporter {
  /** 实例内事件编号，独立于轮次和记录容量；关闭采集也不复用来源身份。 */
  private sequence = 0;
  /** diagnostics() 的有限事件尾部，供现有调用方查询，不保存 FlushContext。 */
  private recent: Diagnostic[] = [];
  /** 调度开始前的有效触发事件，开始一轮时移交并清空。 */
  private triggers: Diagnostic[] = [];
  /** 来源超限的事实随下一轮报告转交，避免误报完整因果关系。 */
  private triggersTruncated = false;
  /** 只在同步调度期间有效；异步回调必须捕获 DiagnosticOrigin。 */
  private active?: { readonly round: number; readonly journal: Journal };
  /** 同步调用栈；await 之前必须退出，异步回报显式携带启动 trace。 */
  private current?: ExecutionTrace;
  /** 实际调用序号，与事件序号、轮次和完整校验调用号分别计数。 */
  private executionSequence = 0;
  /** 当前同步发布的因果来源；退出发布边界后恢复。 */
  private trigger?: DiagnosticTrigger;
  /** 只在完整调用等待期间持有记录，结束后删除；异步 trace 仅保存 callId。 */
  private readonly calls = new Map<
    number,
    { entries: Diagnostic[]; errors: Diagnostic[]; truncated: boolean }
  >();

  /** 接入条数预算与可选 Host 出口，不在构造时建立轮次 Journal。 */
  constructor(
    readonly capacity: number,
    private readonly output: ((report: RuntimeDiagnosticReport) => void) | undefined,
    private readonly prepared: () => ReadonlyPreparedForm,
    private readonly input: () => DiagnosticInput,
    private readonly tap?: (report: RuntimeDiagnosticReport) => void,
  ) {}

  /** 建立执行身份；子动作继承规则和完整调用，输入始终按实际调用点捕获。 */
  execution(
    kind: string,
    input: DiagnosticInput,
    details: Partial<DiagnosticExecution> = {},
    triggers?: readonly DiagnosticTrigger[],
    calls = this.current?.calls ?? new Set<number>(),
  ): ExecutionTrace {
    const parent = this.current;
    return new ExecutionTrace(
      Object.freeze({
        ...(parent?.ref.callId === undefined ? {} : { callId: parent.ref.callId }),
        ...((kind === 'command' || kind === 'host.event') && parent?.ref.ruleId
          ? { ruleId: parent.ref.ruleId }
          : {}),
        ...details,
        id: ++this.executionSequence,
        kind,
        ...(parent ? { parentId: parent.ref.id } : {}),
      }),
      input,
      parent?.ref.kind === 'reaction' ? parent.input : parent?.invocationInput,
      Object.freeze((triggers ?? parent?.triggers ?? (this.trigger ? [this.trigger] : [])).slice()),
      calls,
    );
  }

  /** 熔断等运行边界读取当前现场，不能误用外层命令写入前的入口快照。 */
  captureExecution(kind: string): ExecutionTrace {
    return this.execution(kind, this.input());
  }

  /** 仅在同步边界安装执行元信息；返回后恢复，不能将此方法跨 await 使用。 */
  run<T>(trace: ExecutionTrace, execute: () => T): T {
    const previous = this.current;
    this.current = trace;
    try {
      return execute();
    } finally {
      this.current = previous;
    }
  }

  /** 在发布期间传递因果来源，入队者自行捕获，避免依赖有限 Trace。 */
  withTrigger<T>(trigger: DiagnosticTrigger, execute: () => T): T {
    const previous = this.trigger;
    this.trigger = Object.freeze({ ...trigger, origin: Object.freeze({ ...trigger.origin }) });
    try {
      return execute();
    } finally {
      this.trigger = previous;
    }
  }
  /** 捕获当前发布来源；首次激活等无外部发布时分配独立来源身份。 */
  captureTrigger(input: DiagnosticInput): DiagnosticTrigger {
    return this.trigger ?? Object.freeze({ origin: this.capture('execution.trigger'), input });
  }
  /** 接管实际读到的校验投影，避免公开诊断中的嵌套记录可被改写。 */
  noteRead(value: ReadonlyJson): void {
    if (this.current) this.current.validationReads.push(copyJson(value));
  }

  /** 调用独享收集窗口，容量只约束普通事件；错误保留全部。 */
  beginCall(callId: number, input: DiagnosticInput): ExecutionTrace {
    this.calls.set(callId, { entries: [], errors: [], truncated: false });
    return this.execution('validation.call', input, { callId }, undefined, new Set([callId]));
  }
  /** 封存本次记录并释放收集器，迟到任务不能修改已经返回的结果。 */
  endCall(callId: number): { entries: readonly Diagnostic[]; truncated: boolean } {
    const call = this.calls.get(callId);
    this.calls.delete(callId);
    return {
      entries: Object.freeze(
        [...(call?.entries ?? []), ...(call?.errors ?? [])].sort((a, b) => a.sequence - b.sequence),
      ),
      truncated: call?.truncated ?? false,
    };
  }

  /** 异常入口保留原 Error 的可用堆栈，输出不依赖辅助事件预算。 */
  error(
    kind: string,
    error: unknown,
    trace = this.current,
    phase = kind,
    action?: ReadonlyJson,
    origin?: DiagnosticOrigin,
  ): Diagnostic {
    trace ??= this.execution(kind, this.input());
    const input = trace.validationReads.length
      ? Object.freeze({
          ...trace.input,
          validationReads: Object.freeze(trace.validationReads.slice()),
        })
      : trace.input;
    // 跨上下文 Error 不满足本地 instanceof，仍须保留其名称、消息和可用堆栈。
    const exception =
      error instanceof Error || Object.prototype.toString.call(error) === '[object Error]'
        ? (error as Error)
        : undefined;
    const evidence: DiagnosticEvidence = Object.freeze({
      execution: trace.ref,
      input,
      ...(trace.invocationInput ? { invocationInput: trace.invocationInput } : {}),
      triggers: trace.triggers,
      prepared: this.prepared(),
      phase,
      error: Object.freeze(
        exception
          ? {
              name: exception.name,
              message: exception.message,
              ...(exception.stack ? { stack: exception.stack } : {}),
            }
          : { name: 'ThrownValue', message: String(error) },
      ),
      ...(action === undefined ? {} : { action }),
      ...(trace.parameters === undefined ? {} : { parameters: trace.parameters }),
    });
    return this.run(trace, () =>
      this.record(kind, String(error), trace.ref.ruleId, origin, false, evidence),
    );
  }

  /** 分配并冻结事件；显式异步 origin 的事件始终独立交付，不追加到当前或旧轮次。 */
  record(
    kind: string,
    message?: string,
    ruleId?: string,
    origin?: DiagnosticOrigin,
    trigger = false,
    evidence?: DiagnosticEvidence,
  ): Diagnostic {
    const round = origin ? undefined : this.active?.round;
    const entry = Object.freeze({
      sequence: ++this.sequence,
      kind,
      ...(message === undefined ? {} : { message }),
      ...(ruleId === undefined ? {} : { ruleId }),
      ...(round === undefined ? {} : { round }),
      ...(origin ? { origin: Object.freeze({ ...origin }) } : {}),
      ...(this.current ? { execution: this.current.ref } : {}),
      ...(this.current?.calls.size ? { relatedCalls: Object.freeze([...this.current.calls]) } : {}),
      ...(evidence ? { evidence } : {}),
    });
    const recipients = new Set(this.current?.calls);
    if (this.current?.ref.callId !== undefined) recipients.add(this.current.ref.callId);
    for (const id of recipients) {
      const call = this.calls.get(id);
      if (call) {
        if (evidence) call.errors.push(entry);
        else
          call.truncated = retainDiagnostic(call.entries, entry, this.capacity) || call.truncated;
      }
    }
    retainDiagnostic(this.recent, entry, this.capacity);
    if (round !== undefined) this.active!.journal.record(entry);
    else {
      if (trigger) this.addTrigger(entry);
      if (this.capacity && !evidence) this.emit(Object.freeze({ kind: 'runtime', entry }));
    }
    if (evidence) this.emit(Object.freeze({ kind: 'runtime', entry }));
    return entry;
  }

  /** 仅在事件确实导致待调度工作时登记前置来源，不能把无关旧事件带入下一轮。 */
  addTrigger(entry: Diagnostic): void {
    if (this.active) return;
    this.triggersTruncated =
      retainDiagnostic(this.triggers, entry, this.capacity) || this.triggersTruncated;
  }

  /** 记录异步任务启动并返回轻量来源，避免闭包保留整个轮次对象。 */
  capture(kind: string, ruleId?: string): DiagnosticOrigin {
    const entry = this.record(kind, undefined, ruleId);
    return Object.freeze({
      sequence: entry.sequence,
      ...(entry.round === undefined ? {} : { round: entry.round }),
    });
  }

  /** 将前置触发移交给新轮次，最近事件查询仍独立保留有限尾部。 */
  takeTriggers(): { entries: readonly Diagnostic[]; truncated: boolean } {
    const taken = { entries: this.triggers, truncated: this.triggersTruncated };
    this.discardTriggers();
    return taken;
  }

  /** 开放同步事件路由；调用方必须为本轮新建 Journal。 */
  begin(round: number, journal: Journal): void {
    if (this.active) throw Error('diagnostics: overlapping synchronous rounds');
    this.active = { round, journal };
  }

  /** 先封存并断开当前 Journal，再异步输出报告，不允许 Host 回调改写旧轮次。 */
  finish(outcome: FlushOutcome): void {
    const active = this.active;
    if (!active || active.round !== outcome.round) throw Error('diagnostics: missing round');
    this.active = undefined;
    this.emit(active.journal.finish(outcome));
  }

  /** 返回最近事件的只读数组副本，跨轮查询不等于保留完整轮次历史。 */
  /** 有界定位现存完整现场，不复制整份 Trace，也不延长错误输入保留期。 */
  hasEvidence(sequences: readonly number[], maximum: number): boolean {
    if (sequences.length > maximum) throw Error('budget');
    const remaining = new Set(sequences);
    if (!remaining.size) return false;
    let visited = 0;
    for (let index = this.recent.length - 1; index >= 0; index--) {
      if (++visited > maximum) throw Error('budget');
      const entry = this.recent[index]!;
      if (entry.evidence) remaining.delete(entry.sequence);
      if (!remaining.size) return true;
    }
    return false;
  }
  read(): readonly Diagnostic[] {
    return Object.freeze(this.recent.slice());
  }

  /** 未开始的调度被销毁时丢弃前置来源，不清除最后诊断证据。 */
  discardTriggers(): void {
    this.triggers = [];
    this.triggersTruncated = false;
  }

  /** Host 出口在微任务交付；异常只记轻量诊断，不递归调用失败的出口或影响调度。 */
  private emit(report: RuntimeDiagnosticReport): void {
    // 开发工具只接收封存报告；不订阅业务观察，也不拦截 Host 原出口。
    try {
      this.tap?.(report);
    } catch {
      /* 工具错误被隔离。 */
    }
    if (!this.output) return;
    const output = this.output;
    void Promise.resolve().then(() => {
      try {
        const returned: unknown = output(report);
        observeRejection(returned, (error) => this.outputError(error));
      } catch (error) {
        this.outputError(error);
      }
    });
  }

  /** 输出通道本身失败时只写查询尾部，不再次调用该通道或重新调度业务。 */
  private outputError(error: unknown): void {
    const entry = Object.freeze({
      sequence: ++this.sequence,
      kind: 'diagnostic.output.error',
      message: String(error),
    });
    retainDiagnostic(this.recent, entry, Math.max(1, this.capacity));
  }
}
