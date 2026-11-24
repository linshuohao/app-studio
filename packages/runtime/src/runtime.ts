import {
  registerObservedProducer,
  observedEntityId,
  observedPreparedId,
  observedProducerRef,
  emitObservedEvent,
} from './devtools/index.js';
import { createRuntimeMetadataProducer } from './devtools/observation-runtime.js';
import { createMetadataReader } from './devtools/observation-reader.js';
import type { MetadataValue, EventRef } from './devtools/observation-protocol.js';
import { DEVTOOLS_ENABLED } from './devtools/index.js';
import { diagnosticSummary } from './devtools/diagnostic-summary.js';
import type { JsonValue } from '@form-engine/protocol';
import type {
  Command,
  DataReference,
  Expression,
  HostEventIntent,
  InteractionIntent,
  ReactionAction,
  Reference,
  ValueSpec,
} from '@form-engine/protocol/definition';
import type {
  DataWatch,
  PreparedForm,
  ReadonlyPreparedForm,
  PreparedReaction,
  PreparedReactionWatch,
  PreparedScopeDeclaration,
  PreparedValueSpec,
} from '@form-engine/protocol/prepared';
import { captureJson, copyJson, readAt } from './data/json.js';
import { DataStore } from './data/store.js';
import {
  bindScopes,
  bindingAlive,
  bindingKey,
  resolvePath,
  resolveLocation,
  type ReadView,
  type ScopeBinding,
} from './scope/registry.js';
import { Evaluator, MissingValue, type EvaluationFrame } from './expression/evaluator.js';
import { executeCommand, ownScope } from './commands/execute.js';
import { checkExecution, type SchemaRoot } from './lifecycle/view.js';
import { loadCompiledForm, validCommand } from './lifecycle/load.js';
import {
  capturePreparedForm,
  PreparedStructureError,
} from '@form-engine/protocol/internal/prepared';
import { applyDataSchemaDefaults } from '@form-engine/protocol/internal/schema';
import { observeRejection } from './lifecycle/async.js';
import { ObserverRegistry } from './observation/registry.js';
import { ReactionScheduler } from './reactions/scheduler.js';
import { ValidationManager } from './validation/manager.js';
import { DiagnosticReporter } from './diagnostics/reporter.js';
import type {
  RuntimeOptions,
  FormRuntime,
  ReadResult,
  CommandResult,
  HostCapabilities,
  ReadonlyJson,
  Observation,
  FlushOutcome,
  FieldValidation,
  FullValidationResult,
  Diagnostic,
  DiagnosticOrigin,
  DiagnosticInput,
  DiagnosticTrigger,
} from './types.js';

/** 一条 Prepared Reaction 在一个具体 Scope 下的活跃实例，随成员增删创建 / 销毁。 */
interface ReactionInstance {
  /** 编译后的静态规则，同一规则可在不同成员 Scope 下形成多个实例。 */
  readonly rule: PreparedReaction;
  /** 此实例的稳定成员定位，移动后由当前 ReadView 解析新位置。 */
  readonly scope: ScopeBinding;
  /** 解除此实例的内部 watch 订阅，成员删除或 Runtime 销毁时调用。 */
  readonly dispose: () => void;
  /** 入队合并的触发现场；执行前取走并清空，执行中再次触发属于下一次调用。 */
  readonly triggers: Map<number, DiagnosticTrigger>;
}
/** 单次 dispatch 及其 batch 叶命令共享的结果；跨 flush 不保留。 */
interface CommandExecution {
  interrupted?: boolean;
  operation?: EventRef;
  reactionExecutionId?: string;
  actionIndex?: number;
  /** 任意叶命令产生有效修改即为 true；后续失败不会回滚此前修改。 */
  changed: boolean;
  /** 按执行顺序累积叶命令错误，形成 dispatch 的统一返回结果。 */
  readonly errors: string[];
}

/** 组合各领域模块，串联 Command → 观察失效 → Reaction → 校验；对外提供实例 API。 */
class Runtime implements FormRuntime {
  #stopObservation?: () => void;
  #evidenceLocators?: Map<number, readonly number[]>;
  #metadataDepth = 0;
  #initialOperation?: EventRef;
  #observedTrigger?: { diagnosticSequence: number; event?: EventRef };
  readonly #functionSchemas: Readonly<Record<string, readonly SchemaRoot[]>>;
  readonly #scopeInvalidationListeners = new Set<() => void>();
  // 固定输入与模块依赖；生命周期策略仍由各模块负责。
  /** 已接管并校验的编译产物，提供规则、表达式与锁定能力需求。 */
  readonly #compiledForm: PreparedForm;
  /** L3 使用的 Host 事件 / 校验器注册表快照；物料 Request 由 Adapter 接入。 */
  readonly #hostCapabilities: HostCapabilities;
  /** 是否冻结引擎持有的 Data / Context；不改变只读 API 契约。 */
  readonly #freeze: boolean;
  /** 实例诊断出口与有限事件查询；单轮 Journal 由 Scheduler 的 FlushContext 创建。 */
  readonly #diagnosticReporter: DiagnosticReporter;
  /** Working Data 与配套 Scope 索引的唯一写入入口。 */
  readonly #dataStore: DataStore;
  /** 在显式 EvaluationFrame 中求值引用 / 表达式，不自行修改状态。 */
  readonly #expressionEvaluator: Evaluator;
  /** 观察候选筛选、前后值比较与内外通知顺序。 */
  readonly #observerRegistry: ObserverRegistry;
  /** 联动入队去重、延迟启动和本轮熔断预算。 */
  readonly #reactionScheduler: ReactionScheduler;
  /** 校验来源状态、前置依赖、异步任务资格与完整校验证明。 */
  readonly #validationManager: ValidationManager;

  // 可变实例状态；业务数据本身只由 DataStore 持有。
  /** Host 提供并由 Runtime 接管的环境输入，通过 replaceContext 整体替换。 */
  #hostContext: JsonValue;
  /** 每次替换 Context 递增，供完整校验识别输入过期；不等于 Data revision。 */
  #hostContextRevision = 0;
  /** 生命周期终止标记；销毁后禁止继续读取 / 修改业务状态。 */
  #disposed = false;
  /** 活跃的规则 + Scope 实例及其订阅；待执行任务另由 Scheduler 持有。 */
  readonly #reactionInstances = new Map<string, ReactionInstance>();

  /** 校验装载输入、连接模块、建立规则实例，并预约初始联动 / 校验，不等待异步任务。 */
  constructor(options: RuntimeOptions) {
    const maxExecutions = options.maxExecutions ?? 1000;
    const traceCapacity = options.traceCapacity ?? 200;
    if (
      !Number.isSafeInteger(maxExecutions) ||
      maxExecutions < 1 ||
      !Number.isSafeInteger(traceCapacity) ||
      traceCapacity < 0
    )
      throw Error('load: invalid execution limits');

    this.#freeze = options.freeze ?? true;
    this.#diagnosticReporter = new DiagnosticReporter(
      traceCapacity,
      options.onDiagnostic,
      () => this.#compiledForm as unknown as ReadonlyPreparedForm,
      () => this.#diagnosticInput(),
      DEVTOOLS_ENABLED
        ? (report) => {
            const ref = emitObservedEvent(
              this,
              'diagnostic',
              () => diagnosticSummary(report) as unknown as MetadataValue,
            );
            if (!ref) return;
            const entries = report.kind === 'runtime' ? [report.entry] : report.entries;
            const sequences = entries
              .filter((entry) => entry.evidence)
              .map((entry) => entry.sequence);
            if (!sequences.length || sequences.length > 2000) return;
            const locators = (this.#evidenceLocators ??= new Map());
            locators.set(ref.sequence, sequences);
            let retained = 0;
            for (const entries of locators.values()) retained += entries.length;
            while (retained > 2000) {
              const oldest = locators.keys().next().value!;
              retained -= locators.get(oldest)!.length;
              locators.delete(oldest);
            }
          }
        : undefined,
    );
    // 接管注册表；实例装载后不随 Host 注册字典的修改切换实现。
    const functions = Object.freeze(
      Object.fromEntries(
        Object.entries(options.functions ?? {}).map(([id, binding]) => [
          id,
          Object.freeze({
            ...binding,
            manifest: copyJson(binding.manifest) as unknown as typeof binding.manifest,
            artifact: copyJson(binding.artifact) as unknown as typeof binding.artifact,
          }),
        ]),
      ),
    );
    const registeredFunctions = Object.freeze(
      Object.fromEntries(
        Object.entries(options.functions ?? {}).map(([id, binding]) => [
          id,
          id.startsWith('core.') ? binding : functions[id]!,
        ]),
      ),
    );
    this.#compiledForm = loadCompiledForm(options.prepared, registeredFunctions);
    const initialData = copyJson(options.data, false);
    applyDataSchemaDefaults(
      initialData,
      this.#compiledForm.definition.data.schema,
      this.#compiledForm.resources.schemas,
    );
    this.#hostCapabilities = Object.freeze({
      events: Object.freeze({ ...options.host?.events }),
      validators: Object.freeze({ ...options.host?.validators }),
    });
    this.#dataStore = new DataStore(initialData, this.#freeze);
    this.#hostContext = copyJson(
      options.context === undefined ? {} : options.context,
      this.#freeze,
    );
    const boundFunctions = Object.freeze(
      Object.fromEntries(
        Object.keys(this.#compiledForm.capabilityLock.pureFunctions).map((id) => [
          id,
          registeredFunctions[id]!,
        ]),
      ),
    );
    this.#functionSchemas = Object.fromEntries(
      Object.entries(boundFunctions).map(([id, { manifest }]) => {
        const base = `https://form-engine.invalid/function/${encodeURIComponent(id)}`;
        return [
          id,
          [
            ...manifest.parameters.map((parameter, i) => ({
              schema: parameter.schema,
              uri: `${base}/parameter/${i}`,
            })),
            ...(manifest.restParameter
              ? [{ schema: manifest.restParameter.schema, uri: `${base}/parameter/rest` }]
              : []),
            { schema: manifest.returns, uri: `${base}/returns` },
          ],
        ];
      }),
    );
    this.#expressionEvaluator = new Evaluator(
      this.#compiledForm.definition.expressions ?? {},
      boundFunctions,
      this.#compiledForm.resources.schemas,
    );
    this.#observerRegistry = new ObserverRegistry(
      () => this.#dataStore.capture(),
      (watch, scope, view) => this.#readWatch(watch, scope, view),
      (error) =>
        this.#diagnosticReporter.error(
          'observer.error',
          error,
          this.#diagnosticReporter.captureExecution('observer.effect'),
        ),
      {
        maximum: maxExecutions,
        consume: (generation) => this.#reactionScheduler.consumeNotification(generation),
        abort: () => this.#reactionScheduler.abortNotifications(),
      },
      (callback, scope) => {
        const trace = this.#diagnosticReporter.execution(
          'observer',
          this.#diagnosticInput(this.#createEvaluationFrame(scope)),
        );
        this.#diagnosticReporter.run(trace, () => {
          try {
            const origin = this.#diagnosticReporter.capture('observer.start');
            const returned: unknown = callback();
            observeRejection(returned, (error) => {
              if (!this.#disposed)
                this.#diagnosticReporter.error(
                  'observer.error',
                  error,
                  trace,
                  'callback',
                  undefined,
                  origin,
                );
            });
          } catch (error) {
            this.#diagnosticReporter.error('observer.error', error, trace, 'callback');
          }
        });
      },
    );
    this.#reactionScheduler = new ReactionScheduler(
      maxExecutions,
      () => this.#afterReactions(),
      this.#diagnosticReporter,
      (id, reason) => {
        emitObservedEvent(this, 'reaction.queue-cancelled', () => ({
          queueEntryId: `queue:${id}`,
          reason,
        }));
      },
    );
    this.#validationManager = new ValidationManager(this.#compiledForm, this.#expressionEvaluator, {
      observationOwner: this,
      observationCause: () => this.#observedTrigger?.event ?? this.#initialOperation,
      view: () => this.#dataStore.capture(),
      contextRevision: () => this.#hostContextRevision,
      frame: (scope) => this.#createEvaluationFrame(scope),
      observe: (watch, scope, callback) =>
        this.#observerRegistry.add(watch, scope, callback, true).dispose,
      publish: (paths, origin, event) => {
        const entry = this.#diagnosticReporter.record(
          'validation.change',
          undefined,
          undefined,
          origin,
        );
        const previous = this.#observedTrigger;
        this.#observedTrigger = { diagnosticSequence: entry.sequence, event };
        try {
          this.#diagnosticReporter.withTrigger(
            {
              origin: {
                sequence: entry.sequence,
                ...(entry.round === undefined ? {} : { round: entry.round }),
              },
              input: this.#diagnosticInput(),
            },
            () => {
              if (this.#observerRegistry.validationChanged(paths) && !this.#disposed)
                this.#diagnosticReporter.addTrigger(entry);
            },
          );
        } finally {
          this.#observedTrigger = previous;
        }
      },
      schedule: () => this.#reactionScheduler.schedule(),
      captureOrigin: (kind, ruleId) => this.#diagnosticReporter.capture(kind, ruleId),
      diagnostics: this.#diagnosticReporter,
      diagnosticInput: (scope) => this.#diagnosticInput(this.#createEvaluationFrame(scope)),
      deferEffect: (effect) => this.#observerRegistry.deferEffect(effect),
      host: this.#hostCapabilities,
    });
    if (DEVTOOLS_ENABLED && 'window' in globalThis) {
      this.#stopObservation = registerObservedProducer(this, (ref, budget) => {
        const identity = (object: object) => observedEntityId(this, object);
        const base = createRuntimeMetadataProducer(
          ref,
          this.#compiledForm,
          observedPreparedId(this.#compiledForm),
          budget,
          () => {
            const validation = this.#metadataDepth
              ? undefined
              : this.#validationManager.inspectMetadata(identity, budget.maxRows);
            const instances: MetadataValue[] = [];
            if (this.#reactionInstances.size > budget.maxRows) throw Error('budget');
            if (validation)
              for (const instance of this.#reactionInstances.values())
                instances.push({
                  record: 'reaction-instance',
                  entityId: identity(instance),
                  ruleId: instance.rule.id,
                  binding: instance.scope as unknown as MetadataValue,
                  lifecycle: 'active',
                });
            return {
              view: this.#dataStore.capture(),
              contextRevision: this.#hostContextRevision,
              metadataRevision: 0,
              coordinating: !!this.#metadataDepth || !validation,
              instances,
              validation: validation ?? [],
            };
          },
        );
        const reader = createMetadataReader(ref, budget.maxBytes, () => {
          const snapshot = base.snapshot();
          return 'status' in snapshot
            ? { status: 'busy' }
            : { rows: snapshot.rows, inputVersion: base.inputVersion() };
        });
        return Object.freeze({
          ...reader,
          inputVersion: base.inputVersion,
          inspect: base.inspect,
          locateEvidence: (event: EventRef) => {
            const sequences = this.#evidenceLocators?.get(event.sequence) ?? [];
            const available = this.#diagnosticReporter.hasEvidence(sequences, 2000);
            return {
              status: 'ok' as const,
              event,
              availability: available ? ('available' as const) : ('unavailable' as const),
              reason: available
                ? ('retained-runtime-diagnostic' as const)
                : ('not-recorded-or-expired' as const),
              diagnosticSequences: available ? sequences : [],
            };
          },
        });
      });
    }
    this.#bindPublicMethods();
    this.#initialOperation = emitObservedEvent(this, 'operation.started', () => ({
      source: 'initialize',
      inputVersion: {
        dataRevision: this.#dataStore.capture().revision,
        contextRevision: this.#hostContextRevision,
      },
    }));
    this.#validationManager.observeInitialization(this.#initialOperation);
    this.#report('runtime.initialize', undefined, undefined, undefined, true);
    this.#refreshRuleInstances();
    emitObservedEvent(this, 'operation.returned', () => ({
      operation: this.#initialOperation ?? null,
      scope: 'entry-return',
      ok: true,
      changed: false,
      inputVersion: {
        dataRevision: this.#dataStore.capture().revision,
        contextRevision: this.#hostContextRevision,
      },
    }));
    this.#initialOperation = undefined;
    this.#reactionScheduler.schedule();
    // 公共方法保持不可覆盖；原生私有字段仍能维护实例状态。
    Object.freeze(this);
  }

  /** 从当前输入解析引用，将缺失 / 读取异常包装为结果；不会触发 flush。 */
  read(reference: Reference, scope: ScopeBinding = {}): ReadResult {
    return this.#captureReadResult(() =>
      this.#expressionEvaluator.reference(reference, this.#createEvaluationFrame(scope)),
    );
  }

  /** 兼容接入只比较执行内容；新视图不得带入未锁定函数或另一套规则。 */
  checkView(input: ReadonlyPreparedForm): ReturnType<FormRuntime['checkView']> {
    try {
      this.#assertAlive();
      const candidateForm = capturePreparedForm(input);
      if (candidateForm.preparedFormatVersion !== this.#compiledForm.preparedFormatVersion)
        throw Error('view: invalid Prepared format');
      checkExecution(this.#compiledForm, candidateForm, this.#functionSchemas);
      return { compatible: true };
    } catch (error) {
      return {
        compatible: false,
        error:
          error instanceof PreparedStructureError
            ? 'Error: view: invalid Prepared format'
            : String(error),
      };
    }
  }

  /** 成员删除即失效，不等待 React 清理。 */
  isScopeAlive(scope: ScopeBinding = {}): boolean {
    try {
      return !this.#disposed && bindingAlive(this.#dataStore.capture(), ownScope(scope));
    } catch {
      return false;
    }
  }

  /** 独立生命周期观察，不改变普通 Data / Validation 订阅的销毁语义。 */
  observeScope(
    scope: ScopeBinding,
    invalidated: () => void,
  ): ReturnType<FormRuntime['observeScope']> {
    const binding = ownScope(scope);
    if (!this.isScopeAlive(binding))
      return Object.freeze({ alive: false, dispose: () => undefined });
    let active = true;
    let disposeObservation = () => {};
    const dispose = () => {
      if (!active) return;
      active = false;
      this.#scopeInvalidationListeners.delete(invalidate);
      disposeObservation();
    };
    const invalidate = () => {
      if (!active || this.isScopeAlive(binding)) return;
      dispose();
      try {
        invalidated();
      } catch (error) {
        this.#diagnosticReporter.error('scope.observer.error', error);
      }
    };
    disposeObservation = this.#observerRegistry.add([], binding, invalidate).dispose;
    this.#scopeInvalidationListeners.add(invalidate);
    return Object.freeze({ alive: true, dispose });
  }

  /** 同一事件快照既供命令求值，也供 Host 通知，不绕过 Runtime 的诊断路径。 */
  interact(intent: InteractionIntent, scope: ScopeBinding = {}, event?: JsonValue): CommandResult {
    if (intent.type === 'form.command') return this.dispatch(intent.command, scope, event);
    try {
      this.#assertAlive();
      const binding = ownScope(scope);
      if (!this.isScopeAlive(binding)) throw Error('interaction: inactive Scope');
      const ok = this.#emitHostEvent(
        copyJson(intent) as unknown as HostEventIntent,
        binding,
        undefined,
        event === undefined ? undefined : copyJson(event),
      );
      return Object.freeze({
        ok,
        changed: false,
        errors: Object.freeze(ok ? [] : ['interaction: Host event failed']),
      });
    } catch (error) {
      this.#diagnosticReporter.error('interaction.error', error);
      return Object.freeze({ ok: false, changed: false, errors: Object.freeze([String(error)]) });
    }
  }

  /** 返回调用时的数据根快照，不隐式 flush、等待校验或建立业务 Baseline。 */
  snapshot(): ReadonlyJson {
    this.#assertAlive();
    return this.#dataStore.capture().root;
  }

  /** 按当前数据展开 Scope 声明，供 Host / 后续 Renderer 持有稳定成员绑定。 */
  bind(declaration?: PreparedScopeDeclaration, parent: ScopeBinding = {}): ScopeBinding[] {
    this.#assertAlive();
    return bindScopes(this.#dataStore.capture(), declaration, ownScope(parent));
  }

  /** 在当前 Data / Context 及本次 Scope / Event 中求值单个表达式，只读不写入。 */
  evaluate(expression: Expression, scope: ScopeBinding = {}, event?: JsonValue): ReadResult {
    return this.#captureReadResult(() =>
      this.#expressionEvaluator.expression(
        expression,
        this.#createEvaluationFrame(
          ownScope(scope),
          event === undefined ? undefined : copyJson(event),
        ),
      ),
    );
  }

  /** 递归求值 ValueSpec 中的表达式包装，返回 props / Command 值 / Payload 等业务 JSON。 */
  evaluateValue(
    value: ValueSpec | PreparedValueSpec,
    scope: ScopeBinding = {},
    event?: JsonValue,
  ): ReadResult {
    return this.#captureReadResult(() =>
      this.#expressionEvaluator.value(
        value,
        this.#createEvaluationFrame(
          ownScope(scope),
          event === undefined ? undefined : copyJson(event),
        ),
      ),
    );
  }

  /** 同步执行 Command 并完成逐叶变化通知；Reaction 延迟调度，batch 不整体回滚。 */
  dispatch(command: Command, scope: ScopeBinding = {}, event?: JsonValue): CommandResult {
    const execution: CommandExecution = { changed: false, errors: [] };
    const binding = ownScope(scope);
    const capturedEvent = event === undefined ? undefined : copyJson(event);
    execution.operation = emitObservedEvent(this, 'operation.started', () => ({
      source: 'dispatch',
      inputVersion: {
        dataRevision: this.#dataStore.capture().revision,
        contextRevision: this.#hostContextRevision,
      },
    }));
    try {
      this.#executeCommand(
        captureJson(command) as unknown as Command,
        binding,
        capturedEvent,
        execution,
      );
    } catch (error) {
      execution.errors.push(String(error));
      this.#diagnosticReporter.error('command.error', error);
    }
    emitObservedEvent(this, 'operation.returned', () => ({
      operation: execution.operation ?? null,
      scope: 'entry-return',
      ok: !execution.errors.length,
      changed: execution.changed,
      inputVersion: {
        dataRevision: this.#dataStore.capture().revision,
        contextRevision: this.#hostContextRevision,
      },
    }));
    return Object.freeze({
      ok: !execution.errors.length,
      changed: execution.changed,
      errors: Object.freeze(execution.errors),
    });
  }

  /** 先登记外部订阅再返回初读值；回调只发失效通知，调用方收到后重新读取。 */
  observe(
    watches: readonly PreparedReactionWatch[] | readonly DataWatch[],
    callback: () => void,
    scope: ScopeBinding = {},
  ): Observation {
    this.#assertAlive();
    const owned = copyJson(watches) as unknown as typeof watches;
    const subscription = this.#observerRegistry.add(owned, ownScope(scope), callback);
    return Object.freeze({
      values: Object.freeze(
        subscription.values.map((value): ReadResult =>
          value.kind === 'error' ? { kind: 'error', error: 'observation: invalid Scope' } : value,
        ),
      ),
      dispose: subscription.dispose,
    });
  }

  /** 等待已预约 / 正在执行的同步联动轮次结束，不等待 Host 请求与外部校验 Promise。 */
  flush(): Promise<FlushOutcome> {
    return this.#reactionScheduler.flush();
  }

  /** 聚合影响指定字段的当前校验来源，不发起新的校验。 */
  getValidation(field: DataReference, scope: ScopeBinding = {}): FieldValidation {
    this.#assertAlive();
    return this.#validationManager.field(field, scope);
  }

  /** 对本次捕获输入启动完整校验并等待结果；输入变化时返回 stale，不自动保存业务数据。 */
  validate(): Promise<FullValidationResult> {
    this.#assertAlive();
    const operation = emitObservedEvent(this, 'operation.started', () => ({
      source: 'validate',
      inputVersion: {
        dataRevision: this.#dataStore.capture().revision,
        contextRevision: this.#hostContextRevision,
      },
    }));
    let ok = false;
    try {
      const result = this.#validationManager.validate(operation);
      ok = true;
      return result;
    } finally {
      emitObservedEvent(this, 'operation.returned', () => ({
        operation: operation ?? null,
        scope: 'entry-return',
        ok,
        changed: false,
        inputVersion: {
          dataRevision: this.#dataStore.capture().revision,
          contextRevision: this.#hostContextRevision,
        },
      }));
    }
  }

  /** 整体替换 Host 环境输入，失效校验与外部读取；不伪造 Data 变化或触发 Data watch。 */
  replaceContext(input: unknown): void {
    const operation = emitObservedEvent(this, 'operation.started', () => ({
      source: 'replaceContext',
      inputVersion: {
        dataRevision: this.#dataStore.capture().revision,
        contextRevision: this.#hostContextRevision,
      },
    }));
    let changed = false,
      ok = false;
    this.#metadataDepth++;
    try {
      this.#assertAlive();
      this.#hostContext = copyJson(input, this.#freeze);
      this.#hostContextRevision++;
      changed = true;
      this.#report('context.replace', undefined, undefined, undefined, true);
      this.#observerRegistry.transaction(() => {
        this.#validationManager.inputChanged(true);
        this.#observerRegistry.contextChanged();
      });
      ok = true;
    } finally {
      this.#metadataDepth--;
      emitObservedEvent(this, 'operation.returned', () => ({
        operation: operation ?? null,
        scope: 'entry-return',
        ok,
        changed,
        inputVersion: {
          dataRevision: this.#dataStore.capture().revision,
          contextRevision: this.#hostContextRevision,
        },
      }));
    }
  }

  /** 读取实例最近诊断事件，返回独立只读数组；销毁后仍可排查最后事件。 */
  diagnostics(): readonly Diagnostic[] {
    return this.#diagnosticReporter.read();
  }

  /** 幂等终止调度、解除订阅并撤销异步校验发布资格，保留诊断记录供排查。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#stopObservation?.();
    this.#evidenceLocators = undefined;
    this.#reactionScheduler.dispose();
    this.#reactionInstances.forEach((instance) => instance.dispose());
    this.#reactionInstances.clear();
    this.#validationManager.dispose();
    for (const invalidate of [...this.#scopeInvalidationListeners]) invalidate();
    this.#observerRegistry.clear();
    this.#report('runtime.dispose');
  }

  /** 展开 batch 并逐叶提交；有效修改后按顺序失效校验、更新规则实例、比较观察值。 */
  #executeCommand(
    command: Command,
    scope: ScopeBinding,
    event: JsonValue | undefined,
    execution: CommandExecution,
    source: 'external' | 'prepared' = 'external',
  ): void {
    this.#metadataDepth++;
    try {
      const trace = this.#diagnosticReporter.execution(
        'command',
        this.#diagnosticInput(this.#createEvaluationFrame(scope, event)),
      );
      const commandRef = () => ({
        commandId: `command:${trace.ref.id}`,
        operation: execution.operation ?? null,
        reactionExecutionId: execution.reactionExecutionId ?? null,
        actionIndex: execution.actionIndex ?? null,
      });
      let commandChanged = false;
      let outcome: 'changed' | 'no-change' | 'error' | 'partial-error' | 'not-executed' =
        'not-executed';
      this.#diagnosticReporter.run(trace, () => {
        try {
          this.#assertAlive();
          if (this.#reactionScheduler.hasAborted()) {
            execution.interrupted = true;
            return;
          }
          if (command.op === 'batch') {
            if (
              source === 'external' &&
              (Object.keys(command).some((key) => !['op', 'commands'].includes(key)) ||
                !Array.isArray(command.commands))
            )
              throw Error('command: invalid batch');
            for (const leaf of command.commands)
              this.#executeCommand(leaf, scope, event, execution, source);
            return;
          }
          // 外部命令在此逐叶检查；Prepared 动作已在装载时接管并检查，动态执行保护仍共用。
          if (source === 'external' && !validCommand(command))
            throw Error('command: invalid shape');
          const before = this.#dataStore.capture();
          const mutation = executeCommand(
            this.#dataStore,
            this.#expressionEvaluator,
            command,
            this.#createEvaluationFrame(scope, event),
          );
          outcome = mutation.changed ? 'changed' : 'no-change';
          if (!mutation.changed) return;
          commandChanged = true;
          const observedChange = emitObservedEvent(this, 'data.changed', () => ({
            ...commandRef(),
            target: before.scopes.locate(mutation.path),
            path: mutation.path,
            before: { dataRevision: before.revision, contextRevision: this.#hostContextRevision },
            after: {
              dataRevision: this.#dataStore.capture().revision,
              contextRevision: this.#hostContextRevision,
            },
            topologyChanged: this.#dataStore.capture().topologyChanged,
            detail: 'target-only',
          }));
          execution.changed = true;
          const change = this.#diagnosticReporter.record(
            'data.change',
            this.#diagnosticReporter.capacity ? JSON.stringify(command) : undefined,
            undefined,
            undefined,
            true,
          );
          const previousObservedTrigger = this.#observedTrigger;
          this.#observedTrigger = { diagnosticSequence: change.sequence, event: observedChange };
          try {
            this.#diagnosticReporter.withTrigger(
              {
                origin: {
                  sequence: change.sequence,
                  ...(change.round === undefined ? {} : { round: change.round }),
                },
                input: this.#diagnosticInput(this.#createEvaluationFrame(scope, event)),
              },
              () =>
                this.#observerRegistry.transaction(() => {
                  this.#validationManager.inputChanged();
                  if (this.#dataStore.capture().topologyChanged) this.#refreshRuleInstances();
                  this.#observerRegistry.dataChanged(mutation.path, before);
                }),
            );
          } finally {
            this.#observedTrigger = previousObservedTrigger;
          }
        } catch (error) {
          outcome = commandChanged ? 'partial-error' : 'error';
          const message = String(error);
          execution.errors.push(message);
          this.#diagnosticReporter.error(
            'command.error',
            error,
            trace,
            'command',
            command as unknown as ReadonlyJson,
          );
        } finally {
          // batch 本身不伪造一次叶命令执行；子项分别保留结果和有效修改。
          if (command?.op !== 'batch')
            emitObservedEvent(this, 'command.finished', () => ({
              ...commandRef(),
              outcome,
              diagnostic: 'not-collected',
            }));
        }
      });
    } finally {
      this.#metadataDepth--;
    }
  }

  /** 数据结构变化后重绑定规则；保留已有成员实例，只为新实例处理 runOnActivate。 */
  #refreshRuleInstances(): void {
    this.#metadataDepth++;
    try {
      this.#validationManager.refresh();
      const keys = new Set<string>();
      for (const rule of this.#compiledForm.definition.reactions ?? []) {
        for (const scope of bindScopes(this.#dataStore.capture(), rule.scope)) {
          const key = `${rule.id}:${bindingKey(scope)}`;
          keys.add(key);
          if (this.#reactionInstances.has(key)) continue;
          const dispose = this.#observerRegistry.add(
            rule.watch,
            scope,
            () => this.#enqueueReaction(key),
            true,
          ).dispose;
          const instance = { rule, scope, dispose, triggers: new Map() };
          this.#reactionInstances.set(key, instance);
          emitObservedEvent(this, 'entity.added', () => ({
            entity: { ...observedProducerRef(this)!, entityId: observedEntityId(this, instance) },
            row: {
              record: 'reaction-instance',
              entityId: observedEntityId(this, instance),
              ruleId: rule.id,
              binding: scope as unknown as MetadataValue,
              lifecycle: 'active',
            },
          }));
          if (rule.runOnActivate) this.#enqueueReaction(key);
        }
      }
      for (const [key, instance] of this.#reactionInstances) {
        if (keys.has(key)) continue;
        emitObservedEvent(this, 'entity.disposed', () => ({
          entity: { ...observedProducerRef(this)!, entityId: observedEntityId(this, instance) },
          row: {
            record: 'reaction-instance',
            entityId: observedEntityId(this, instance),
            ruleId: instance.rule.id,
            binding: instance.scope as unknown as MetadataValue,
            lifecycle: 'disposed',
          },
        }));
        instance.dispose();
        this.#reactionInstances.delete(key);
        this.#reactionScheduler.remove(key);
      }
    } finally {
      this.#metadataDepth--;
    }
  }

  /** 按实例键入队，多个 watch 失效可合并为一次待执行任务。 */
  #enqueueReaction(key: string): void {
    const instance = this.#reactionInstances.get(key);
    let cause: EventRef | undefined;
    if (instance) {
      const trigger = this.#diagnosticReporter.captureTrigger(
        this.#diagnosticInput(this.#createEvaluationFrame(instance.scope)),
      );
      instance.triggers.set(trigger.origin.sequence, trigger);
      if (this.#observedTrigger?.diagnosticSequence === trigger.origin.sequence)
        cause = this.#observedTrigger.event;
    }
    const queue = this.#reactionScheduler.enqueue(key, (id) => this.#runReaction(key, id));
    if (instance && queue)
      emitObservedEvent(this, queue.merged ? 'reaction.queue-merged' : 'reaction.queued', () => {
        const ref = observedProducerRef(this);
        if (!ref) throw Error('disposed');
        return {
          instance: { ...ref, entityId: observedEntityId(this, instance) },
          queueEntryId: `queue:${queue.id}`,
          cause: cause ?? this.#initialOperation ?? null,
        };
      });
  }

  /** 读取执行时最新数据判断 when，再按声明顺序执行响应项；已失效实例直接跳过。 */
  #runReaction(key: string, queueId: number): void {
    const instance = this.#reactionInstances.get(key);
    if (!instance || this.#disposed) return;
    const trace = this.#diagnosticReporter.execution(
      'reaction',
      this.#diagnosticInput(this.#createEvaluationFrame(instance.scope)),
      { ruleId: instance.rule.id },
      [...instance.triggers.values()],
    );
    instance.triggers.clear();
    // 使用已有执行编号；无录制时不创建 DTO，中途开始也能采集之后真实发生的终态。
    const execution = () => {
      const ref = observedProducerRef(this);
      if (!ref) throw Error('disposed');
      return {
        instance: { ...ref, entityId: observedEntityId(this, instance) },
        executionId: `execution:${trace.ref.id}`,
      };
    };
    emitObservedEvent(this, 'reaction.started', () => ({
      ...execution(),
      inputVersion: {
        dataRevision: this.#dataStore.capture().revision,
        contextRevision: this.#hostContextRevision,
      },
      causes: 'queue-events',
      queueEntryId: `queue:${queueId}`,
    }));
    const skipped = (
      from: number,
      reason: 'condition-false' | 'condition-error' | 'interrupted',
    ) => {
      for (let index = from; index < instance.rule.then.length; index++)
        emitObservedEvent(this, 'action.finished', () => ({
          reactionExecutionId: `execution:${trace.ref.id}`,
          actionIndex: index,
          scope: 'synchronous-return',
          diagnostic: 'not-collected',
          kind: 'type' in instance.rule.then[index]! ? 'host.emit' : 'command',
          outcome: 'not-executed',
          reason,
        }));
    };
    let outcome: 'completed' | 'condition-false' | 'condition-error' | 'interrupted' = 'completed';
    this.#diagnosticReporter.run(trace, () => {
      try {
        this.#report('reaction.execute', undefined, instance.rule.id);
        const condition =
          instance.rule.when === undefined
            ? undefined
            : this.#expressionEvaluator.boolean(
                instance.rule.when,
                this.#createEvaluationFrame(instance.scope),
              );
        emitObservedEvent(this, 'reaction.condition', () => ({
          ...execution(),
          outcome: condition === undefined ? 'absent' : condition ? 'true' : 'false',
        }));
        if (condition === false) {
          outcome = 'condition-false';
          skipped(0, 'condition-false');
          return;
        }
        for (const [actionIndex, action] of instance.rule.then.entries()) {
          if (this.#disposed || this.#reactionScheduler.hasAborted()) {
            outcome = 'interrupted';
            skipped(actionIndex, 'interrupted');
            break;
          }
          this.#executeReactionAction(
            action,
            instance.scope,
            instance.rule.id,
            `execution:${trace.ref.id}`,
            actionIndex,
          );
        }
        if (this.#disposed || this.#reactionScheduler.hasAborted()) outcome = 'interrupted';
      } catch (error) {
        outcome = 'condition-error';
        skipped(0, 'condition-error');
        emitObservedEvent(this, 'reaction.condition', () => ({
          ...execution(),
          outcome: 'error',
          diagnostic: 'not-collected',
        }));
        this.#diagnosticReporter.error('reaction.error', error, trace, 'when');
      } finally {
        emitObservedEvent(this, 'reaction.finished', () => ({
          ...execution(),
          outcome,
          actionCoverage: 'all-declared',
        }));
      }
    });
  }

  /** 分派数据 Command 或 Host 通知；单项异常记诊断，后续响应项继续执行。 */
  #executeReactionAction(
    action: ReactionAction,
    scope: ScopeBinding,
    ruleId: string,
    reactionExecutionId: string,
    actionIndex: number,
  ): void {
    let hostReturned = false;
    const execution: CommandExecution = {
      changed: false,
      errors: [],
      reactionExecutionId,
      actionIndex,
    };
    let failed = false;
    try {
      if ('type' in action) hostReturned = this.#emitHostEvent(action, scope, ruleId);
      else this.#executeCommand(action, scope, undefined, execution, 'prepared');
    } catch (error) {
      failed = true;
      this.#diagnosticReporter.error(
        'reaction.action.error',
        error,
        undefined,
        'action',
        action as unknown as ReadonlyJson,
      );
    } finally {
      emitObservedEvent(this, 'action.finished', () => {
        const common = {
          reactionExecutionId,
          actionIndex,
          scope: 'synchronous-return' as const,
          diagnostic: 'not-collected' as const,
        };
        return 'type' in action
          ? { ...common, kind: 'host.emit', outcome: hostReturned ? 'returned' : 'error' }
          : {
              ...common,
              kind: 'command',
              changed: execution.changed,
              outcome: execution.interrupted
                ? 'interrupted'
                : failed || execution.errors.length
                  ? execution.changed
                    ? 'partial-error'
                    : 'error'
                  : execution.changed
                    ? 'changed'
                    : 'no-change',
            };
      });
    }
  }

  /** 捕获调用输入后同步交付 Host 事件；返回的异步任务只处理拒绝，不延长本轮 flush。 */
  #emitHostEvent(
    action: HostEventIntent,
    scope: ScopeBinding,
    ruleId?: string,
    event?: JsonValue,
  ): boolean {
    const callback =
      this.#hostCapabilities.events && Object.hasOwn(this.#hostCapabilities.events, action.event)
        ? this.#hostCapabilities.events[action.event]
        : undefined;
    if (!callback) {
      this.#report('host.event.missing', action.event, ruleId);
      return false;
    }
    let ok = true;
    const input = this.#createEvaluationFrame(scope, event);
    const trace = this.#diagnosticReporter.execution('host.event', this.#diagnosticInput(input), {
      ruleId,
    });
    this.#diagnosticReporter.run(trace, () => {
      let phase = 'payload';
      const origin = this.#diagnosticReporter.capture('host.event.start', ruleId);
      try {
        const payload =
          action.payload === undefined
            ? undefined
            : this.#expressionEvaluator.value(action.payload, input);
        trace.parameters = Object.freeze({
          event: action.event,
          ...(payload === undefined ? {} : { payload }),
        });
        phase = 'invoke';
        // Host 业务异步任务不延长同步 Flush。
        const returned: unknown = callback(
          Object.freeze({
            event: action.event,
            snapshot: input.view.root,
            context: input.context,
            scope,
            ...(payload === undefined ? {} : { payload }),
            read: (reference: DataReference) =>
              this.#diagnosticReporter.run(trace, () =>
                this.#captureReadResult(() =>
                  this.#expressionEvaluator.reference(reference, input),
                ),
              ),
          }),
        );
        observeRejection(returned, (error) => {
          if (!this.#disposed)
            this.#diagnosticReporter.error(
              'host.event.error',
              error,
              trace,
              'host.event',
              undefined,
              origin,
            );
        });
        this.#report('host.event.emit', action.event, ruleId);
      } catch (error) {
        ok = false;
        this.#diagnosticReporter.error(
          'reaction.action.error',
          error,
          trace,
          phase,
          action as unknown as ReadonlyJson,
          origin,
        );
      }
    });
    return ok;
  }

  /** 每次联动队列排空后进入增量校验，结果变化可经观察器重新触发联动。 */
  #afterReactions(): boolean {
    this.#validationManager.run();
    return this.#validationManager.hasPending();
  }

  /** 读取观察投影：Data 值、数组成员顺序或字段校验状态，供 Registry 比较前后差异。 */
  #readWatch(
    watch: PreparedReactionWatch,
    scope: ScopeBinding,
    view: ReadView,
  ): JsonValue | undefined {
    if (watch.source === 'validation')
      return this.#validationProjection(
        watch.observe,
        this.#validationManager.field(watch.field, scope),
      );
    const path = resolvePath(view, watch, scope);
    if (watch.aspect === 'structure') {
      const ids = view.scopes.membersOf(path);
      return ids ? copyJson(ids) : undefined;
    }
    const result = readAt(view.root, path);
    return result.kind === 'value' ? result.value : undefined;
  }

  /** 捕获本次求值的 Data / Context 输入；不是 flush 上下文，也不在表达式之间累计状态。 */
  #createEvaluationFrame(scope: ScopeBinding = {}, event?: JsonValue): EvaluationFrame {
    return {
      view: this.#dataStore.capture(),
      context: this.#hostContext,
      scope,
      ...(event === undefined ? {} : { event }),
      validation: (reference, binding) => {
        const value = this.#validationProjection(
          reference.observe,
          this.#validationManager.field(reference.field, binding),
        );
        this.#diagnosticReporter.noteRead({
          reference: reference as unknown as ReadonlyJson,
          value,
        });
        return value;
      },
    };
  }

  /** 只捕获输入与当时物理路径，异步回报不重新读取当前 Store。 */
  #diagnosticInput(frame = this.#createEvaluationFrame()): DiagnosticInput {
    const paths: Array<[string, string]> = [];
    for (const [alias, location] of Object.entries(frame.scope)) {
      try {
        paths.push([alias, resolveLocation(frame.view, location)]);
      } catch {
        /* 删除后的错误仍保留稳定句柄。 */
      }
    }
    return Object.freeze({
      runtimeId: frame.view.runtimeId,
      dataRevision: frame.view.revision,
      contextRevision: this.#hostContextRevision,
      snapshot: frame.view.root,
      context: frame.context,
      scope: frame.scope,
      scopePaths: Object.freeze(Object.fromEntries(paths)),
      ...(frame.event === undefined ? {} : { event: frame.event }),
    });
  }

  /** 按声明选择校验 status / issues / 完整字段状态，统一提供给引用求值和观察比较。 */
  #validationProjection(observe: 'status' | 'issues' | 'state', state: FieldValidation): JsonValue {
    return (observe === 'status'
      ? state.status
      : observe === 'issues'
        ? state.issues
        : state) as unknown as JsonValue;
  }

  /** 统一只读入口的错误边界：Missing 独立返回，其他异常转为 error 而不抛给 Host。 */
  #captureReadResult(read: () => JsonValue): ReadResult {
    try {
      this.#assertAlive();
      return { kind: 'value', value: read() };
    } catch (error) {
      if (error instanceof MissingValue) return { kind: 'missing' };
      return { kind: 'error', error: String(error) };
    }
  }

  /** 业务入口的生命周期检查；由调用方选择抛出或包装成失败结果。 */
  #assertAlive(): void {
    if (this.#disposed) throw Error('runtime: disposed');
  }

  /** 各模块诊断的统一写入口，只记录事实，不参与业务控制。 */
  #report(
    kind: string,
    message?: string,
    ruleId?: string,
    origin?: DiagnosticOrigin,
    trigger = false,
  ): void {
    this.#diagnosticReporter.record(kind, message, ruleId, origin, trigger);
  }

  /** 绑定 this，使公开方法可解构或作为回调传递；构造后再冻结公开实例。 */
  #bindPublicMethods(): void {
    // 保留原入口方法可解构 / 直接作为回调传递的行为。
    this.checkView = this.checkView.bind(this);
    this.isScopeAlive = this.isScopeAlive.bind(this);
    this.observeScope = this.observeScope.bind(this);
    this.interact = this.interact.bind(this);
    this.read = this.read.bind(this);
    this.snapshot = this.snapshot.bind(this);
    this.bind = this.bind.bind(this);
    this.evaluate = this.evaluate.bind(this);
    this.evaluateValue = this.evaluateValue.bind(this);
    this.dispatch = this.dispatch.bind(this);
    this.observe = this.observe.bind(this);
    this.flush = this.flush.bind(this);
    this.getValidation = this.getValidation.bind(this);
    this.validate = this.validate.bind(this);
    this.replaceContext = this.replaceContext.bind(this);
    this.diagnostics = this.diagnostics.bind(this);
    this.dispose = this.dispose.bind(this);
  }
}

/** 公共构造入口；所有状态及生命周期均由新建的 Runtime 实例持有。 */
export function createRuntime(options: RuntimeOptions): FormRuntime {
  return new Runtime(options);
}
