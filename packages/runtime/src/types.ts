import type { JsonValue } from '@form-engine/protocol';
import type {
  DataReference,
  Reference,
  Expression,
  ValueSpec,
  InteractionIntent,
} from '@form-engine/protocol/definition';
import type {
  ReadonlyPreparedForm,
  DataWatch,
  PreparedReactionWatch,
  PreparedScopeDeclaration,
  PreparedValueSpec,
} from '@form-engine/protocol/prepared';
import type { FunctionRegistry } from '@form-engine/pure-functions';
import type { Command } from '@form-engine/protocol/definition';
import type { ScopeBinding } from './scope/registry.js';

/** Host 可读取的 JSON 类型；只读约束在默认冻结模式下另有运行期保护。 */
export type ReadonlyJson =
  | null
  | string
  | number
  | boolean
  | readonly ReadonlyJson[]
  | { readonly [key: string]: ReadonlyJson };
/** 公共读入口区分值、缺失与失败，避免把合法的 null / false 与不可读混同。 */
export type ReadResult =
  | { readonly kind: 'value'; readonly value: ReadonlyJson }
  | { readonly kind: 'missing'; readonly value?: never }
  | { readonly kind: 'error'; readonly error: string; readonly value?: never };
/** 异步任务的启动事件引用；只保留编号，不持有已结束轮次的上下文或 Journal。 */
export interface DiagnosticOrigin {
  readonly sequence: number;
  readonly round?: number;
}
/** 一次执行真正读到的输入；共享不可变数据根，不保存 Store、Journal 或运行期对象。 */
export interface DiagnosticInput {
  readonly runtimeId: string;
  readonly dataRevision: number;
  readonly contextRevision: number;
  readonly snapshot: ReadonlyJson;
  readonly context: ReadonlyJson;
  readonly scope: ScopeBinding;
  readonly scopePaths: Readonly<Record<string, string>>;
  readonly event?: ReadonlyJson;
  readonly validationReads?: readonly ReadonlyJson[];
}
/** 独立执行身份；完整校验关联只靠 callId，不靠最近事件的时间窗口猜测。 */
export interface DiagnosticExecution {
  readonly id: number;
  readonly kind: string;
  readonly parentId?: number;
  readonly ruleId?: string;
  readonly validator?: string;
  readonly callId?: number;
}
/** 触发输入与实际调用输入分开，合并入队后仍能追溯触发来源。 */
export interface DiagnosticTrigger {
  readonly origin: DiagnosticOrigin;
  readonly input: DiagnosticInput;
}
/** 必需的异常复现证据，不受辅助 Trace 容量控制；Host 决定持久化和上报策略。 */
export interface DiagnosticEvidence {
  readonly execution: DiagnosticExecution;
  readonly input: DiagnosticInput;
  readonly invocationInput?: DiagnosticInput;
  readonly triggers: readonly DiagnosticTrigger[];
  readonly prepared: ReadonlyPreparedForm;
  readonly phase: string;
  readonly error: { readonly name: string; readonly message: string; readonly stack?: string };
  readonly action?: ReadonlyJson;
  /** 外部能力实际返回的 JSON，或 Host 通知求值后的参数。 */
  readonly parameters?: ReadonlyJson;
}
/** 最近执行事件的轻量记录；轮次外事件不伪造当前 round。 */
export interface Diagnostic {
  /** Runtime 实例内的事件序号，跨 flush 递增，容量截断后可能从大于 1 的值开始。 */
  readonly sequence: number;
  /** 事件类别，例如 flush.start、reaction.execute、validator.error。 */
  readonly kind: string;
  /** 关联的规则定义 ID；不包含 Scope 实例身份。 */
  readonly ruleId?: string;
  /** 可选事件说明或错误信息。 */
  readonly message?: string;
  /** 事件实际发生的同步调度轮次；调度前来源和异步回报不设置此字段。 */
  readonly round?: number;
  /** 异步回报关联的启动事件，和事件发生时的轮次分开表达。 */
  readonly origin?: DiagnosticOrigin;
  readonly execution?: DiagnosticExecution;
  /** 正在等待共享任务的完整调用；执行的原始归属仍由 execution / origin 表达。 */
  readonly relatedCalls?: readonly number[];
  readonly evidence?: DiagnosticEvidence;
}
/** 一轮同步联动与校验反馈的结束结果，不表示所有 Host 异步任务完成。 */
export interface FlushOutcome {
  /** 实际启动的调度轮次编号；空闲 flush 返回最近一轮，不额外增加编号。 */
  readonly round: number;
  /** settled 为同步阶段收敛，aborted 为本轮中断，disposed 为实例终止。 */
  readonly status: 'settled' | 'aborted' | 'disposed';
  /** 本轮尝试执行的 Reaction 实例任务数，不含每条 Command 或外部异步任务。 */
  readonly executions: number;
}
/** 已结束轮次的不可变报告；entries 可含调度前触发事件，截断时不得假设因果链完整。 */
export interface FlushDiagnosticReport {
  readonly kind: 'flush';
  readonly outcome: FlushOutcome;
  readonly entries: readonly Diagnostic[];
  readonly triggeredBy: readonly DiagnosticOrigin[];
  readonly truncated: boolean;
}
/** 实例诊断出口：已结束轮次报告、轮次外事件，或不受Trace预算控制的独立错误证据。 */
export type RuntimeDiagnosticReport =
  FlushDiagnosticReport | { readonly kind: 'runtime'; readonly entry: Diagnostic };
/** 字段 / 来源校验状态；技术未完成与业务不通过分开表达。 */
export type ValidationStatus =
  'unverified' | 'pending' | 'valid' | 'invalid' | 'incomplete' | 'blocked';
/** 一个来源贡献的业务问题，使用稳定成员定位，以便数组移动后继续归属原成员。 */
export interface ValidationIssue {
  readonly source: string;
  readonly code: string;
  readonly message?: string;
  readonly field: { readonly member?: string; readonly path: string };
}
/** 目标字段当前聚合状态与问题，不等同于一次完整校验证明。 */
export interface FieldValidation {
  readonly status: ValidationStatus;
  readonly issues: readonly ValidationIssue[];
}
/** 完整校验中一个规则实例的执行覆盖，包含未适用、前置阻断及技术未完成的证据。 */
export interface Coverage {
  readonly instance: string;
  readonly ruleId: string;
  readonly status: ValidationStatus | 'not-applicable' | 'blocked';
  readonly reason?: string;
}
/** 针对一次捕获输入的校验证明；输入失效时 status=stale，不能直接用于新输入提交。 */
export interface FullValidationResult {
  /** 完整 validate 调用序号，与 flush 轮次独立。 */
  readonly call: number;
  /** 本证明绑定的 Runtime / Data / Context 版本。 */
  readonly input: {
    readonly runtimeId: string;
    readonly dataRevision: number;
    readonly contextRevision: number;
  };
  /** 校验开始时的数据快照，供 Host 后续转换 / 保存，不随当前编辑变化。 */
  readonly snapshot: ReadonlyJson;
  readonly status: 'valid' | 'invalid' | 'incomplete' | 'stale';
  readonly issues: readonly ValidationIssue[];
  readonly coverage: readonly Coverage[];
  readonly diagnostics: readonly Diagnostic[];
  /** 辅助事件达到预算；异常证据不截断。 */
  readonly diagnosticsTruncated?: boolean;
}
/** Host 调用的只读输入；read 与 snapshot 绑定同一调用时数据版本。 */
export interface HostReadInput {
  readonly snapshot: ReadonlyJson;
  readonly context: ReadonlyJson;
  readonly scope: ScopeBinding;
  readonly read: (reference: DataReference) => ReadResult;
}
/** 无返回通知的事件名与求值后 Payload，Host 自行管理后续异步业务。 */
export interface HostEventInput extends HostReadInput {
  readonly event: string;
  readonly payload?: ReadonlyJson;
}
/** 外部校验器调用输入，附带规则及声明目标，网络策略留给 Host。 */
export interface ValidatorInput extends HostReadInput {
  readonly ruleId: string;
  readonly target: DataReference;
}
/** Host 返回的问题；省略 target 时归属规则声明目标，运行时再转换为稳定成员位置。 */
export interface ValidatorIssue {
  readonly code: string;
  readonly message?: string;
  readonly target?: DataReference;
}
/** 外部校验任务；取消只是尽力通知，结果是否可发布由 Runtime 资格检查决定。 */
export interface ValidatorTask {
  /** 空数组表示无业务问题；拒绝或非法返回结构属于技术未完成。 */
  readonly result: Promise<readonly ValidatorIssue[]>;
  /** 可选取消副作用，不要求使 result Promise 真正结束。 */
  readonly cancel?: () => void;
}
/**
 * L3 Runtime 消费的 Host 能力子集：业务通知和外部校验。
 * 完整 Host 还包括物料 requests，其结果交付由 Renderer / Adapter 桥接，当前不在此注册。
 */
export interface HostCapabilities {
  /** 按 Host 事件名注册的通知处理函数，Runtime 不等待其异步完成。 */
  readonly events?: Readonly<Record<string, (input: HostEventInput) => void>>;
  /** 按能力名注册的外部校验器，同一实现可被不同规则 / Scope 独立调用。 */
  readonly validators?: Readonly<Record<string, (input: ValidatorInput) => ValidatorTask>>;
}
/** 创建一个独立 Runtime 的输入，Data / Context 接管复制，能力实现按锁固定。 */
export interface RuntimeOptions {
  /** Compiler 已编译的产物，装载时仍检查形状、格式与函数锁。 */
  readonly prepared: ReadonlyPreparedForm;
  /** Host 明确提供的业务初值，必须是纯 JSON；Schema 默认值填充缺失位置且不覆盖显式 null。 */
  readonly data: unknown;
  /** 只读环境输入，缺省为空对象，可通过独立入口整体替换。 */
  readonly context?: unknown;
  /** 纯函数实现注册表，需要覆盖 Prepared 能力锁要求的函数。 */
  readonly functions?: FunctionRegistry;
  /** 本 Runtime 需要的事件 / 校验能力实现，不是完整页面 Host 注册表。 */
  readonly host?: HostCapabilities;
  /** 单轮执行预算，默认 1000；达到上限时丢弃剩余联动，后续交互仍可调度。 */
  readonly maxExecutions?: number;
  /** 辅助 Trace / 最近事件条数上限，默认 200；0 关闭辅助采集，异常仍交付出口。 */
  readonly traceCapacity?: number;
  /** 异步交付不可变轮次报告 / 独立事件；异常被隔离，不影响数据写入和执行预算。 */
  readonly onDiagnostic?: (report: RuntimeDiagnosticReport) => void;
  /** 默认 true，递归冻结引擎持有的数据；关闭后只读契约仍有效。 */
  readonly freeze?: boolean;
}
/** 一个外部订阅的初读结果及解除句柄；后续通知不携带新值。 */
export interface Observation {
  /** 返回初值前订阅已生效；值顺序与声明的 watches 顺序一致。 */
  readonly values: readonly ReadResult[];
  /** 解除后不再向该订阅交付回调。 */
  readonly dispose: () => void;
}
/** 单次同步 dispatch 的结果；失败不意味着此前成功的 batch 叶命令被回滚。 */
export interface CommandResult {
  /** 是否所有已执行命令均未报错。 */
  readonly ok: boolean;
  /** 是否至少有一个叶命令提交过有效修改。 */
  readonly changed: boolean;
  /** 累积的命令错误，空数组表示无执行错误。 */
  readonly errors: readonly string[];
}
/** 实例公共读写与生命周期入口；实现方法可解构使用，内部模块保持独立状态所有权。 */
export interface FormRuntime {
  /** 核对新视图与本实例执行部分及已锁定能力兼容，不修改运行实例。 */
  checkView(
    prepared: ReadonlyPreparedForm,
  ): { readonly compatible: true } | { readonly compatible: false; readonly error: string };
  /** 只读生命周期接入；只在成员 / 实例失效时交付一次，解除后不再交付。 */
  observeScope(
    scope: ScopeBinding,
    invalidated: () => void,
  ): { readonly alive: boolean; readonly dispose: () => void };
  /** 即时检查实例和稳定成员资格，不把普通缺失字段判为失效。 */
  isScopeAlive(scope?: ScopeBinding): boolean;
  /** 视图事件的统一入口；Host 同步发起，异步完成不延长 Flush。 */
  interact(intent: InteractionIntent, scope?: ScopeBinding, event?: JsonValue): CommandResult;
  /** 从当前输入读取引用，显式区分值、缺失及错误。 */
  read(reference: Reference, scope?: ScopeBinding): ReadResult;
  /** 取得当前数据根的稳定只读快照，不隐式 flush 或保存 Baseline。 */
  snapshot(): ReadonlyJson;
  /** 按当前数据展开 Scope 声明，建立可随成员移动的词法绑定。 */
  bind(declaration?: PreparedScopeDeclaration, parent?: ScopeBinding): ScopeBinding[];
  /** 只读求值单个表达式，event 仅在本次调用中可用。 */
  evaluate(expression: Expression, scope?: ScopeBinding, event?: JsonValue): ReadResult;
  /** 递归求值 ValueSpec，返回业务 JSON，不自动写入 Data。 */
  evaluateValue(
    value: ValueSpec | PreparedValueSpec,
    scope?: ScopeBinding,
    event?: JsonValue,
  ): ReadResult;
  /** 同步提交数据 Command 并完成观察失效，联动由调度器另行执行。 */
  dispatch(command: Command, scope?: ScopeBinding, event?: JsonValue): CommandResult;
  /** 登记 Data / Validation 观察；callback 触发后由消费者重新读取。 */
  observe(
    watches: readonly PreparedReactionWatch[] | readonly DataWatch[],
    callback: () => void,
    scope?: ScopeBinding,
  ): Observation;
  /** 等待已有同步调度轮次结束，不等待外部校验或 Host 业务请求。 */
  flush(): Promise<FlushOutcome>;
  /** 读取字段当前聚合校验状态，不发起新的校验。 */
  getValidation(field: DataReference, scope?: ScopeBinding): FieldValidation;
  /** 对捕获输入完整校验，等待适用任务；输入失效时返回 stale。 */
  validate(): Promise<FullValidationResult>;
  /** 整体替换只读环境输入并失效校验，不伪造 Data Command。 */
  replaceContext(context: unknown): void;
  /** 取得实例跨 flush 保留的最近诊断事件。 */
  diagnostics(): readonly Diagnostic[];
  /** 幂等销毁，释放订阅、待执行任务和异步结果发布资格。 */
  dispose(): void;
}
