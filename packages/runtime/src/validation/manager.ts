import type { ErrorObject, ValidateFunction } from 'ajv';
import type { DataReference } from '@form-engine/protocol/definition';
import type { PreparedConstraint, PreparedForm, DataWatch } from '@form-engine/protocol/prepared';
import type {
  FieldValidation,
  ValidationIssue,
  ValidationStatus,
  Coverage,
  FullValidationResult,
  HostCapabilities,
  ValidatorTask,
  ValidatorIssue,
  DiagnosticOrigin,
  DiagnosticInput,
  DiagnosticTrigger,
} from '../types.js';
import type { DiagnosticReporter, ExecutionTrace } from '../diagnostics/reporter.js';
import type { EvaluationFrame } from '../expression/evaluator.js';
import { Evaluator } from '../expression/evaluator.js';
import {
  bindScopes,
  bindingKey,
  resolvePath,
  type ReadView,
  type ScopeBinding,
} from '../scope/registry.js';
import { childPath, overlaps, copyJson, readAt } from '../data/json.js';
import { fieldLocation, currentFieldPath } from './fields.js';
import { createSchemaCompiler, DATA_SCHEMA_BASE } from './schema.js';
import { ValidationCall, ValidationWork } from './work.js';
import { observeRejection, toPromise } from '../lifecycle/async.js';

/** 一个校验结果来源：整体 Schema，或一条 Constraint 在具体 Scope 下的实例。 */
interface Source {
  /** schema，或规则 ID + 稳定 Scope 绑定键，用于隔离同规则的不同成员实例。 */
  readonly key: string;
  /** Schema 来源无 rule；其余来源保留对应 Prepared Constraint。 */
  readonly rule?: PreparedConstraint;
  /** 规则实例的词法绑定，异步结果按捕获时的成员身份归属。 */
  readonly scope: ScopeBinding;
  /** 解除该实例的 Data watch；来源被移除或 Runtime 销毁时调用。 */
  readonly dispose: () => void;
  /** 此来源当前的覆盖状态与问题；字段状态 / 完整结果由多个来源聚合得到。 */
  status: Coverage['status'];
  /** blocked / incomplete 的原因，区分业务前置不满足与技术上无法完成校验。 */
  reason?: string;
  /** 仅此来源贡献的问题；不覆盖其他校验来源的结果。 */
  issues: ValidationIssue[];
  /** 每次撤销旧结果资格递增；旧异步任务即使无法取消，也不能覆盖新结果。 */
  generation: number;
  /** 尚未执行的输入变化来源；执行时移交给该次调用，异步任务只保留启动副本。 */
  triggers: DiagnosticTrigger[];
  /** 当前来源的一份共享工作；新完整调用可接管等待，不重建有效网络任务。 */
  work?: ValidationWork;
  /** 当前外部校验任务；等待由 work 管理，cancel 仅是 Host 的尽力取消。 */
  task?: {
    /** 启动事件引用，取消及迟到回报关联该来源，不保留轮次上下文。 */
    readonly origin: DiagnosticOrigin;
    readonly trace: ExecutionTrace;
    readonly work: ValidationWork;
    /** 任务启动时的来源代次，与当前 generation 一致才具备发布资格。 */
    readonly generation: number;
    /** 可选 Host 取消回调，仅调用一次，失败记录诊断。 */
    cancel?: () => void;
  };
}
/** Runtime 注入的协作接口，避免校验管理器直接拥有 Store、观察器或调度器。 */
interface Dependencies {
  /** 读取当前 Data + Scope 版本。 */
  view: () => ReadView;
  /** 取得独立于 Data revision 的 Context 版本。 */
  contextRevision: () => number;
  /** 捕获一个规则实例的求值输入。 */
  frame: (scope: ScopeBinding) => EvaluationFrame;
  /** 登记内部 Data 订阅，变化时撤销旧校验资格。 */
  observe: (watch: readonly DataWatch[], scope: ScopeBinding, callback: () => void) => () => void;
  /** 发布字段校验投影变化，可触发显式 Validation watch。 */
  publish: (paths: readonly string[], origin?: DiagnosticOrigin) => void;
  /** 预约联动排空后的同步校验阶段。 */
  schedule: () => void;
  /** 捕获任务启动编号；异步回报只保留此来源，不捕获本轮 Journal。 */
  captureOrigin: (kind: string, ruleId?: string) => DiagnosticOrigin;
  /** 独立执行元信息、必需错误证据与完整调用的诊断收集。 */
  diagnostics: DiagnosticReporter;
  /** 捕获完整输入与稳定成员当时的位置。 */
  diagnosticInput: (scope: ScopeBinding) => DiagnosticInput;
  /** 延后 Host 取消等可重入副作用，先完成内部失效。 */
  deferEffect: (effect: () => void) => void;
  /** 本实例已接管的外部校验实现注册表。 */
  host: HostCapabilities;
}
/**
 * 管理实例级校验来源、增量失效和异步结果资格。
 * Scheduler 在联动排空后调用 run；validate 另行捕获输入并等待本次完整校验证据。
 */
export class ValidationManager {
  /** 装载时编译的整体数据 Schema 校验器，只读检查，不强制转换或补默认值。 */
  private readonly schema: ValidateFunction;
  /** 当前活跃的 Schema / Constraint 来源，状态跨 flush 保留到下次失效或结果更新。 */
  private readonly sources = new Map<string, Source>();
  /** 需要重跑的 Constraint 实例键，按失效去重；不是尚未完成的异步任务集合。 */
  private readonly pending = new Set<string>();
  /** 整体 Schema 待重新检查；与 Constraint 的 pending 分开，在 run 中先执行。 */
  private schemaDirty = true;
  /** 销毁后禁止重跑，并使在途异步任务失去发布资格。 */
  private disposed = false;
  /** 完整 validate 调用序号，不是 flush 轮次。 */
  private call = 0;
  /** 当前唯一同步执行入口，通知重入只能补充 pending，不递归执行另一个 run。 */
  private draining = false;
  /** 当前调用栈内正在检查的工作，避免重入重复排入同一项。 */
  private readonly executing = new Set<ValidationWork>();
  /** 工作编号与完整调用、Flush 轮次分开，便于确认队列去重身份。 */
  private workSequence = 0;
  /** 最新完整调用；旧调用失效不取消共享来源工作。 */
  private currentCall?: ValidationCall;
  /** 编译 Schema 并登记整体来源；具体 Scope 规则由 refresh 根据当前数据建立。 */
  constructor(
    /** 本实例静态校验定义及闭合 Schema 资源。 */
    private readonly prepared: PreparedForm,
    /** 执行 when / assert 的只读求值器。 */
    private readonly evaluator: Evaluator,
    /** 动态读输入、发布状态和调用 Host 的依赖出口。 */
    private readonly deps: Dependencies,
  ) {
    this.schema = createSchemaCompiler(prepared.resources.schemas)(
      prepared.definition.data.schema,
      DATA_SCHEMA_BASE,
    );
    this.sources.set('schema', {
      key: 'schema',
      scope: {},
      dispose: () => {},
      status: 'unverified',
      issues: [],
      generation: 0,
      triggers: [],
    });
  }
  /** 按当前 Scope 增删来源；新实例进入待校验集合，删除实例撤销任务并移除问题贡献。 */
  refresh() {
    const keys = new Set<string>(['schema']);
    for (const rule of this.prepared.definition.constraints ?? []) {
      for (const scope of bindScopes(this.deps.view(), rule.scope)) {
        const key = `${rule.id}:${bindingKey(scope)}`;
        keys.add(key);
        if (this.sources.has(key)) continue;
        const source: Source = {
          key,
          rule,
          scope,
          status: 'unverified',
          issues: [],
          generation: 0,
          triggers: [this.deps.diagnostics.captureTrigger(this.deps.diagnosticInput(scope))],
          dispose: this.deps.observe(rule.watch, scope, () => this.invalidate(key)),
        };
        this.sources.set(key, source);
        this.pending.add(key);
      }
    }
    for (const [key, source] of this.sources)
      if (!keys.has(key)) {
        const paths = [
          ...this.sourcePaths(source),
          ...source.issues
            .map((issue) => currentFieldPath(this.deps.view(), issue.field))
            .filter((path): path is string => path !== undefined),
        ];
        this.retireWork(source);
        this.revoke(source);
        source.dispose();
        this.sources.delete(key);
        this.pending.delete(key);
        this.deps.publish(paths);
      }
  }
  /**
   * 每次有效 Data 修改使完整证明过期并重跑 Schema；具体规则由 watch 决定是否失效。
   * Context 替换额外保守失效全部规则，不要求无关 Data 修改取消所有独立异步任务。
   */
  inputChanged(context = false) {
    this.finishCall('stale');
    this.retireWork(this.sources.get('schema')!);
    this.schemaDirty = true;
    this.sources
      .get('schema')!
      .triggers.push(this.deps.diagnostics.captureTrigger(this.deps.diagnosticInput({})));
    this.change(this.sources.get('schema')!, 'unverified', []);
    if (context) for (const key of this.sources.keys()) if (key !== 'schema') this.invalidate(key);
    this.deps.schedule();
  }
  /** 撤销一个来源的旧任务 / 结果，标记 unverified 并预约重跑。 */
  invalidate(key: string) {
    const source = this.sources.get(key);
    if (!source || this.disposed) return;
    this.retireWork(source);
    this.revoke(source);
    source.triggers.push(
      this.deps.diagnostics.captureTrigger(this.deps.diagnosticInput(source.scope)),
    );
    this.pending.add(key);
    this.change(source, 'unverified', []);
    this.deps.schedule();
  }
  /** 先递增代次撤销发布资格，再延后调用 Host cancel；调用等待由工作结果独立管理。 */
  private revoke(source: Source) {
    source.generation++;
    const task = source.task;
    source.task = undefined;
    if (task) {
      const cancel = task.cancel;
      task.cancel = undefined;
      const trace = this.deps.diagnostics.execution(
        'validator.cancel',
        task.trace.input,
        {
          ruleId: source.rule?.id,
          ...(source.rule?.kind === 'external' ? { validator: source.rule.validator } : {}),
        },
        task.trace.triggers,
      );
      if (cancel) this.deps.deferEffect(() => this.invokeCancel(cancel, trace, task.origin));
    }
  }

  /** 两条取消路径共用同步调用与异步拒绝隔离；销毁后的迟到拒绝仅消费。 */
  private invokeCancel(cancel: () => void, trace: ExecutionTrace, origin: DiagnosticOrigin): void {
    const report = (error: unknown) =>
      this.deps.diagnostics.error(
        'validator.cancel.error',
        error,
        trace,
        'cancel',
        undefined,
        origin,
      );
    try {
      const returned: unknown = this.deps.diagnostics.run(trace, cancel);
      observeRejection(returned, (error) => {
        if (!this.disposed) report(error);
      });
    } catch (error) {
      report(error);
    }
  }

  /** 输入 / 实例失效只退休对应工作；网络任务由 revoke 独立撤销资格。 */
  private retireWork(source: Source): void {
    if (source.work) source.work.phase = 'cancelled';
    source.work = undefined;
  }

  /** 以来源实例去重；待执行和在途工作复用，已完成外部结果不跨完整调用缓存。 */
  private request(source: Source): ValidationWork {
    let work = source.work;
    if (!work?.reusable()) source.work = work = new ValidationWork(++this.workSequence, source.key);
    if (!this.executing.has(work)) this.pending.add(source.key);
    if (!source.rule && work.phase === 'queued') this.schemaDirty = true;
    return work;
  }

  /** 结果在通知前绑定到具体工作；重试期间仍能保留旧工作的一致证据。 */
  private publishResult(
    source: Source,
    work: ValidationWork,
    status: Coverage['status'],
    issues: ValidationIssue[],
    reason?: string,
    origin?: DiagnosticOrigin,
  ): void {
    if (source.work !== work || work.phase === 'cancelled') return;
    this.prepareResult(source, work, status, issues, reason);
    this.change(source, status, issues, reason, origin);
  }

  /** 先封存结果身份；取消 / 状态回调中的新调用不会再把失败中的工作当成在途任务复用。 */
  private prepareResult(
    source: Source,
    work: ValidationWork,
    status: Coverage['status'],
    issues: ValidationIssue[],
    reason?: string,
  ): void {
    work.phase = 'settling';
    work.result = Object.freeze({
      coverage: Object.freeze({
        instance: source.key,
        ruleId: source.rule?.id ?? 'schema',
        status,
        ...(reason ? { reason } : {}),
      }),
      issues: Object.freeze(issues.slice()),
    });
  }

  /** 发布及错误采集结束后完成工作，避免完整调用先返回而漏掉错误现场。 */
  private completeWork(work: ValidationWork): void {
    if (work.phase === 'settling') work.phase = 'done';
    if (!this.draining) this.finishCall();
  }

  /** 最新完整调用只能在其覆盖的每份工作终结后返回；过期时封存当时证据并解除等待。 */
  private finishCall(forced?: 'stale'): void {
    const call = this.currentCall;
    if (!call || call.closed) return;
    if (!forced && [...call.required.values()].some((work) => work.phase !== 'done')) return;
    this.currentCall = undefined;
    const coverage: Coverage[] = [],
      issues: ValidationIssue[] = [];
    for (const [key, work] of call.required) {
      const source = this.sources.get(key);
      const result = work.result;
      coverage.push(
        result?.coverage ??
          Object.freeze({
            instance: key,
            ruleId: source?.rule?.id ?? 'schema',
            status: source?.status ?? 'unverified',
            ...(source?.reason ? { reason: source.reason } : {}),
          }),
      );
      issues.push(...(result?.issues ?? source?.issues ?? []));
      work.calls.delete(call.id);
    }
    const incomplete = coverage.some(
      (item) =>
        ['unverified', 'pending', 'incomplete'].includes(item.status) ||
        (item.status === 'blocked' && item.reason !== 'business-prerequisite'),
    );
    const diagnostics = this.deps.diagnostics.endCall(call.id);
    call.finish(
      Object.freeze({
        call: call.id,
        input: Object.freeze({
          runtimeId: call.input.runtimeId,
          dataRevision: call.input.dataRevision,
          contextRevision: call.input.contextRevision,
        }),
        snapshot: call.snapshot(),
        status: forced ?? (incomplete ? 'incomplete' : issues.length ? 'invalid' : 'valid'),
        issues: Object.freeze(issues),
        coverage: Object.freeze(coverage),
        diagnostics: diagnostics.entries,
        diagnosticsTruncated: diagnostics.truncated,
      }),
    );
  }
  /** 返回此来源声明影响的当前字段位置；整体 Schema 覆盖根，失效 Scope 返回空集。 */
  private sourcePaths(source: Source): string[] {
    if (!source.rule) return [''];
    try {
      return [
        resolvePath(
          this.deps.view(),
          source.rule.kind === 'internal' ? source.rule.issue.target : source.rule.target,
          source.scope,
        ),
      ];
    } catch {
      return [];
    }
  }
  /** 先更新来源状态，再通知旧 / 新问题及声明目标位置，使消费者可同步读取一致结果。 */
  private change(
    source: Source,
    status: Coverage['status'],
    issues: ValidationIssue[],
    reason?: string,
    origin?: DiagnosticOrigin,
  ) {
    const oldPaths = source.issues
      .map((issue) => currentFieldPath(this.deps.view(), issue.field))
      .filter((path): path is string => path !== undefined);
    source.status = status;
    source.issues = issues;
    source.reason = reason;
    this.deps.publish(
      [
        ...oldPaths,
        ...this.sourcePaths(source),
        ...issues
          .map((issue) => currentFieldPath(this.deps.view(), issue.field))
          .filter((path): path is string => path !== undefined),
      ],
      origin,
    );
  }
  /** 将 Ajv 错误转成成员身份定位的问题，并应用 Definition 中的错误消息映射。 */
  private schemaIssues(errors: readonly ErrorObject[]): ValidationIssue[] {
    return errors.map((error) => {
      const property =
        error.keyword === 'required'
          ? (error.params.missingProperty as string)
          : error.keyword === 'additionalProperties'
            ? (error.params.additionalProperty as string)
            : undefined;
      const path =
        property === undefined ? error.instancePath : childPath(error.instancePath, property);
      const override = this.prepared.definition.validationMessages?.find(
        (entry) =>
          entry.keyword === error.keyword &&
          error.schemaPath === entry.schemaRef + '/' + error.keyword,
      );
      const message = override
        ? 'text' in override.message
          ? override.message.text
          : override.message.key
        : error.message;
      return Object.freeze({
        source: 'schema',
        code: `schema.${error.keyword}`,
        ...(message ? { message } : {}),
        field: fieldLocation(this.deps.view(), path),
      });
    });
  }
  /** 先整体 Schema，再按前置依赖执行规则；外部任务只启动，不在同步阶段等待。 */
  run(): void {
    if (this.disposed) return;
    if (this.draining) return;
    this.draining = true;
    try {
      if (this.schemaDirty) {
        const source = this.sources.get('schema')!;
        const work = this.request(source);
        this.schemaDirty = false;
        this.pending.delete('schema');
        work.phase = 'running';
        this.executing.add(work);
        const trace = this.deps.diagnostics.execution(
          'schema',
          this.deps.diagnosticInput({}),
          { ruleId: 'schema' },
          source.triggers,
          work.calls,
        );
        source.triggers = [];
        this.deps.diagnostics.run(trace, () => {
          try {
            if ('$async' in this.schema && this.schema.$async)
              throw Error('Asynchronous Schema is not supported');
            const valid = this.schema(this.deps.view().root);
            this.publishResult(
              source,
              work,
              valid ? 'valid' : 'invalid',
              this.schemaIssues(this.schema.errors ?? []),
            );
          } catch (error) {
            this.prepareResult(source, work, 'incomplete', [], 'schema-error');
            this.deps.diagnostics.error('schema.error', error, trace, 'schema');
            this.publishResult(source, work, 'incomplete', [], 'schema-error');
          } finally {
            this.executing.delete(work);
            this.completeWork(work);
          }
        });
      }
      // Schema 发布可同步触发输入修改或新增完整需求；先完成新的 Schema 工作再处理规则。
      if (this.schemaDirty) return;
      // 一次只消费这一批已排队工作；回调新增的需求留到后续交接，继续受 Flush 预算约束。
      const selected = [...this.pending].filter((key) => key !== 'schema');
      // 本次 run 内的依赖遍历状态：completed 避免重复执行，visiting 检测前置环。
      const completed = new Map<string, ValidationWork>(),
        visiting = new Set<string>();
      // 递归先完成内部前置；规则别名可不同，但前置实例必须匹配同一组稳定成员身份。
      const execute = (key: string): Source | undefined => {
        const source = this.sources.get(key);
        if (!source?.rule) return source;
        if (this.schemaDirty) return source;
        if (completed.get(key) === source.work && source.work) return source;
        const work = this.request(source);
        this.pending.delete(key);
        if (visiting.has(key)) {
          this.publishResult(source, work, 'incomplete', [], 'prerequisite-cycle');
          this.completeWork(work);
          return source;
        }
        visiting.add(key);
        this.executing.add(work);
        work.phase = 'running';
        const { rule, scope } = source;
        const trace = this.deps.diagnostics.execution(
          'constraint',
          this.deps.diagnosticInput(scope),
          { ruleId: rule.id, ...(rule.kind === 'external' ? { validator: rule.validator } : {}) },
          source.triggers.length
            ? source.triggers
            : [this.deps.diagnostics.captureTrigger(this.deps.diagnosticInput(scope))],
          work.calls,
        );
        source.triggers = [];
        this.deps.diagnostics.run(trace, () => {
          let phase = 'when';
          try {
            const frame = this.deps.frame(scope);
            const contextRevision = this.deps.contextRevision();
            // Host 取消 / 通知可能同步重入修改输入，前置检查后必须再次确认读取版本仍适用。
            const currentInput = () =>
              !this.disposed &&
              this.sources.get(key) === source &&
              source.work === work &&
              work.phase !== 'cancelled' &&
              this.deps.view() === frame.view &&
              this.deps.contextRevision() === contextRevision;
            const retryCurrentInput = () => {
              if (
                !this.disposed &&
                this.sources.get(key) === source &&
                source.work === work &&
                work.phase !== 'cancelled'
              ) {
                work.phase = source.task ? 'pending' : 'queued';
                this.pending.add(key);
              }
            };
            if (rule.when !== undefined && !this.evaluator.boolean(rule.when, frame)) {
              this.revoke(source);
              if (!currentInput()) {
                retryCurrentInput();
                return source;
              }
              this.publishResult(source, work, 'not-applicable', []);
              return source;
            }
            let blocked: string | undefined;
            phase = 'requires';
            for (const prerequisite of rule.requires ?? []) {
              const ids =
                prerequisite.kind === 'constraint'
                  ? [prerequisite.constraintId]
                  : prerequisite.constraintIds;
              for (const id of ids) {
                const members = new Set(
                  Object.values(scope).flatMap((location) =>
                    location.member ? [location.member] : [],
                  ),
                );
                // 规则间词法别名彼此独立，按底层成员身份匹配前置实例。
                const candidates = [...this.sources.values()].filter(
                  (candidate) =>
                    candidate.rule?.id === id &&
                    Object.values(candidate.scope).every(
                      (location) => !location.member || members.has(location.member),
                    ),
                );
                if (candidates.length !== 1 || candidates[0]!.rule?.kind !== 'internal') {
                  blocked = 'prerequisite-unavailable';
                  continue;
                }
                const predecessor = execute(candidates[0]!.key)!;
                if (
                  predecessor.status === 'invalid' ||
                  (predecessor.status === 'blocked' &&
                    predecessor.reason === 'business-prerequisite')
                )
                  blocked ??= 'business-prerequisite';
                else if (!['valid', 'not-applicable'].includes(predecessor.status))
                  blocked = 'prerequisite-unavailable';
              }
              if (prerequisite.kind === 'field') {
                const path = resolvePath(frame.view, prerequisite.target, scope);
                const schema = this.sources.get('schema')!;
                if (schema.status === 'incomplete' || schema.status === 'unverified')
                  blocked = 'prerequisite-unavailable';
                else if (
                  schema.issues.some((issue) => {
                    const issuePath = currentFieldPath(frame.view, issue.field);
                    return issuePath !== undefined && overlaps(path, issuePath);
                  })
                )
                  blocked ??= 'business-prerequisite';
              }
            }
            if (this.schemaDirty || !currentInput()) {
              retryCurrentInput();
              return source;
            }
            if (blocked) {
              this.revoke(source);
              if (!currentInput()) {
                retryCurrentInput();
                return source;
              }
              this.publishResult(source, work, 'blocked', [], blocked);
              return source;
            }
            // 新完整调用只重新检查资格；已启动、同代次的任务继续被等待，不撤销重发。
            if (
              rule.kind === 'external' &&
              source.task?.work === work &&
              source.task.generation === source.generation
            ) {
              work.phase = 'pending';
              return source;
            }
            this.revoke(source);
            if (!currentInput()) {
              retryCurrentInput();
              return source;
            }
            if (rule.kind === 'internal') {
              phase = 'assert';
              const valid = this.evaluator.boolean(rule.assert, frame);
              const issue: ValidationIssue = {
                source: source.key,
                code: rule.issue.code,
                field: fieldLocation(frame.view, resolvePath(frame.view, rule.issue.target, scope)),
                ...(rule.issue.message
                  ? {
                      message:
                        'text' in rule.issue.message
                          ? rule.issue.message.text
                          : rule.issue.message.key,
                    }
                  : {}),
              };
              this.publishResult(
                source,
                work,
                valid ? 'valid' : 'invalid',
                valid ? [] : [Object.freeze(issue)],
              );
            } else this.startExternal(source, frame, work);
          } catch (error) {
            if (source.work === work && work.phase !== 'cancelled') {
              this.prepareResult(source, work, 'incomplete', [], 'execution-error');
              this.deps.diagnostics.error('validation.error', error, trace, phase);
              this.revoke(source);
              this.publishResult(source, work, 'incomplete', [], 'execution-error');
            }
          } finally {
            visiting.delete(key);
            completed.set(key, work);
            this.executing.delete(work);
            this.completeWork(work);
          }
        });
        return source;
      };
      selected.forEach(execute);
    } finally {
      this.draining = false;
      if (this.hasPending()) this.deps.schedule();
      this.finishCall();
    }
  }
  /** 是否仍需执行同步校验阶段；已启动且等待网络的外部任务不阻塞同步 flush。 */
  hasPending(): boolean {
    return this.schemaDirty || this.pending.size > 0;
  }
  /**
   * 注册发布资格后调用 Host Validator，捕获本次 Data / Context / Scope 作为只读输入。
   * 只接纳仍属于本来源和代次的结果；业务问题记 invalid，技术异常记 incomplete。
   */
  private startExternal(source: Source, frame: EvaluationFrame, work: ValidationWork) {
    const rule = source.rule!;
    if (rule.kind !== 'external') return;
    const validators = this.deps.host.validators;
    const validator =
      validators && Object.hasOwn(validators, rule.validator)
        ? validators[rule.validator]
        : undefined;
    if (!validator) {
      const trace = this.deps.diagnostics.execution(
        'validator',
        this.deps.diagnosticInput(source.scope),
        { ruleId: rule.id, validator: rule.validator },
      );
      this.deps.diagnostics.error(
        'validator.missing',
        Error(`Missing validator: ${rule.validator}`),
        trace,
        'resolve',
      );
      this.publishResult(source, work, 'incomplete', [], 'validator-missing');
      return;
    }
    const generation = source.generation;
    const trace = this.deps.diagnostics.execution(
      'validator',
      this.deps.diagnosticInput(source.scope),
      { ruleId: rule.id, validator: rule.validator },
    );
    const origin = this.deps.captureOrigin('validator.start', rule.id);
    // 必须先登记任务，再开放可能同步 dispatch 的 Host 回调。
    const task = {
      origin,
      trace,
      work,
      generation,
      cancel: undefined as (() => void) | undefined,
    };
    source.task = task;
    work.phase = 'pending';
    this.change(source, 'pending', []);
    if (source.task !== task || this.disposed) return;
    let hostTask: ValidatorTask;
    // 只读取一次任务结果；其余形状检查失败也必须接住已经产生的拒绝。
    let result: Promise<unknown> | undefined;
    let cancel: ValidatorTask['cancel'];
    try {
      const returnedTask: unknown = this.deps.diagnostics.run(trace, () =>
        validator({
          ruleId: rule.id,
          target: rule.target,
          snapshot: frame.view.root,
          context: frame.context,
          scope: frame.scope,
          read: (reference) => {
            try {
              const path = resolvePath(frame.view, reference, frame.scope);
              return this.readCaptured(frame.view, path);
            } catch (error) {
              return { kind: 'error', error: String(error) };
            }
          },
        }),
      );
      if (observeRejection(returnedTask)) throw Error('validator: expected a synchronous task');
      hostTask = returnedTask as ValidatorTask;
      const returnedResult = hostTask?.result;
      result = toPromise(returnedResult);
      cancel = hostTask?.cancel;
      if (!hostTask || !result || (cancel !== undefined && typeof cancel !== 'function'))
        throw Error('validator: expected a Promise task');
    } catch (error) {
      void result?.catch(() => undefined);
      if (source.task === task) {
        source.task = undefined;
        this.prepareResult(source, work, 'incomplete', [], 'validator-error');
        this.deps.diagnostics.error('validator.error', error, trace, 'invoke', undefined, origin);
        this.publishResult(source, work, 'incomplete', [], 'validator-error');
      }
      this.completeWork(work);
      return;
    }
    // cancel 是尽力通知，真正防止旧结果覆盖依赖此处的资格校验。
    const eligible = () =>
      !this.disposed &&
      this.sources.get(source.key) === source &&
      source.task === task &&
      source.generation === generation;
    if (eligible()) task.cancel = cancel;
    else if (cancel) this.invokeCancel(cancel, trace, origin);
    // 同时处理 Promise 拒绝与非法返回结构；已过期任务的错误不再污染当前诊断。
    void result
      .then((result) =>
        this.deps.diagnostics.run(trace, () => {
          if (!eligible()) return;
          const json = copyJson(result) as unknown as readonly ValidatorIssue[];
          trace.parameters = json as unknown as import('../types.js').ReadonlyJson;
          if (!Array.isArray(json)) throw Error('validator: issues must be an array');
          const issues = json.map((issue) => {
            if (
              !issue ||
              typeof issue.code !== 'string' ||
              !issue.code ||
              (issue.message !== undefined && typeof issue.message !== 'string') ||
              Object.keys(issue).some((key) => !['code', 'message', 'target'].includes(key))
            )
              throw Error('validator: invalid issue');
            const target = issue.target ?? rule.target;
            if (target.source !== 'data') throw Error('validator: invalid target');
            return Object.freeze({
              source: source.key,
              code: issue.code,
              ...(issue.message === undefined ? {} : { message: issue.message }),
              field: fieldLocation(frame.view, resolvePath(frame.view, target, frame.scope)),
            });
          });
          source.task = undefined;
          task.cancel = undefined;
          this.publishResult(
            source,
            work,
            issues.length ? 'invalid' : 'valid',
            issues,
            undefined,
            origin,
          );
          this.completeWork(work);
        }),
      )
      .catch((error: unknown) =>
        this.deps.diagnostics.run(trace, () => {
          if (!eligible()) return;
          source.task = undefined;
          task.cancel = undefined;
          this.prepareResult(source, work, 'incomplete', [], 'validator-error');
          this.deps.diagnostics.error('validator.error', error, trace, 'result', undefined, origin);
          this.publishResult(source, work, 'incomplete', [], 'validator-error', origin);
          this.completeWork(work);
        }),
      );
  }
  /** 在启动时捕获的根中读取，避免校验器 await 后无意间读到新输入。 */
  private readCaptured(view: ReadView, path: string) {
    return readAt(view.root, path);
  }
  /** 聚合影响目标字段的来源；问题按当前成员位置投影，未完成状态优先于最终业务结论。 */
  field(target: DataReference, scope: ScopeBinding = {}): FieldValidation {
    const view = this.deps.view(),
      path = resolvePath(view, target, scope);
    const relevant = [...this.sources.values()].filter(
      (source) =>
        !source.rule ||
        this.sourcePaths(source).some((p) => overlaps(p, path)) ||
        source.issues.some((issue) => {
          const p = currentFieldPath(view, issue.field);
          return p !== undefined && overlaps(p, path);
        }),
    );
    const issues = relevant.flatMap((source) =>
      source.issues.filter((issue) => {
        const p = currentFieldPath(view, issue.field);
        return p !== undefined && overlaps(p, path);
      }),
    );
    const states = relevant.map((source) => source.status);
    let status: ValidationStatus;
    if (states.some((state) => state === 'unverified')) status = 'unverified';
    else if (states.some((state) => state === 'pending')) status = 'pending';
    else if (
      states.some((state) => state === 'incomplete') ||
      relevant.some(
        (source) => source.status === 'blocked' && source.reason !== 'business-prerequisite',
      )
    )
      status = 'incomplete';
    else status = issues.length ? 'invalid' : states.includes('blocked') ? 'blocked' : 'valid';
    return Object.freeze({ status, issues: Object.freeze(issues) });
  }
  /** 捕获本次 Data / Context 版本；等待期间输入变化则返回 stale，不把旧证据当作新结果。 */
  validate(): Promise<FullValidationResult> {
    this.finishCall('stale');
    const input = this.deps.diagnosticInput({});
    const call = new ValidationCall(
      ++this.call,
      input,
      this.deps.diagnostics.beginCall(this.call, input),
    );
    this.currentCall = call;
    this.deps.diagnostics.run(call.trace, () => {
      for (const source of this.sources.values()) {
        const reused = source.work?.reusable();
        const work = this.request(source);
        work.calls.add(call.id);
        call.required.set(source.key, work);
        if (reused)
          this.deps.diagnostics.record(
            'validation.work.reuse',
            String(work.id),
            source.rule?.id ?? 'schema',
          );
        // 已在网络等待的任务也需检查本次同步前置，但不会重复发起网络请求。
        if (work.phase === 'pending') this.pending.add(source.key);
      }
      this.run();
    });
    return call.promise;
  }

  /** 使完整校验调用过期，撤销全部外部任务并解除来源订阅，阻止销毁后结果发布。 */
  dispose() {
    this.disposed = true;
    this.finishCall('stale');
    this.sources.forEach((source) => {
      this.retireWork(source);
      this.revoke(source);
      source.dispose();
    });
    this.pending.clear();
    this.sources.clear();
  }
}
