import type {
  Coverage,
  DiagnosticInput,
  FullValidationResult,
  ReadonlyJson,
  ValidationIssue,
} from '../types.js';
import type { ExecutionTrace } from '../diagnostics/reporter.js';

/** 一个来源当前的一份执行工作；排队、同步检查和网络等待共用同一身份。 */
export class ValidationWork {
  /** 同一共享工作只报告一次启动；重查前置不冒充新任务。 */
  started = false;
  /** settling 表示结果正在同步发布，新完整调用可以请求重试，避免复用已完成的外部结果。 */
  phase: 'queued' | 'running' | 'pending' | 'settling' | 'done' | 'cancelled' = 'queued';
  /** 当前等待此工作的完整调用号；调用结束就解除，不持有已结束收集器。 */
  readonly calls = new Set<number>();
  /** 本工作封存的结果，后续重试不会修改它。 */
  result?: { readonly coverage: Coverage; readonly issues: readonly ValidationIssue[] };
  /** 工作身份独立于调用号；source 是规则 + Scope 的稳定来源键。 */
  constructor(
    readonly id: number,
    readonly source: string,
    /** 工作创建时的来源代次，发布重入不会改写此事实身份。 */
    readonly generation = 0,
  ) {}
  /** 只合并尚未完成的工作，已发布结果保留重新执行能力。 */
  reusable(): boolean {
    return ['queued', 'running', 'pending'].includes(this.phase);
  }
}

/** 一次完整调用的输入与覆盖需求；不拥有共享任务的取消权。 */
export class ValidationCall {
  /** 本次要求完成的工作，包含 Schema、正常跳过、阻断和所有适用异步义务。 */
  readonly required = new Map<string, ValidationWork>();
  /** Host 等待的单次结果，输入失效或被新调用替代时立即结束。 */
  readonly promise: Promise<FullValidationResult>;
  /** 唯一结果交付入口，不连接任务取消或网络句柄。 */
  private resolve!: (result: FullValidationResult) => void;
  /** 防止重入时重复封存同一个结果。 */
  closed = false;
  /** 输入与诊断入口只属于本次完整调用，结束后由 Manager 解除引用。 */
  constructor(
    readonly id: number,
    readonly input: DiagnosticInput,
    readonly trace: ExecutionTrace,
  ) {
    this.promise = new Promise((resolve) => {
      this.resolve = resolve;
    });
  }
  /** 封存调用返回值；共享工作本身继续按来源资格执行。 */
  finish(result: FullValidationResult): void {
    if (this.closed) return;
    this.closed = true;
    this.resolve(result);
  }
  /** 使用启动快照形成返回输入，不能用当前表单代替。 */
  snapshot(): ReadonlyJson {
    return this.input.snapshot;
  }
}
