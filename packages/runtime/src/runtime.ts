import type { JsonValue } from '@form-engine/protocol';
import type {
  Command,
  DataReference,
  Expression,
  HostEventIntent,
  ReactionAction,
  Reference,
  ValueSpec,
} from '@form-engine/protocol/definition';
import type {
  DataWatch,
  PreparedForm,
  PreparedReaction,
  PreparedReactionWatch,
  PreparedScopeDeclaration,
  PreparedValueSpec,
} from '@form-engine/protocol/prepared';
import { ownJson, readAt } from './data/json.js';
import { DataStore } from './data/store.js';
import {
  bindScopes,
  bindingKey,
  resolvePath,
  resolveLocation,
  type ReadView,
  type ScopeBinding,
} from './scope/registry.js';
import { Evaluator, MissingValue, type EvaluationFrame } from './expression/evaluator.js';
import { executeCommand, ownScope } from './commands/execute.js';
import { loadPrepared, validCommand } from './lifecycle/load.js';
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
  /** 任意叶命令产生有效修改即为 true；后续失败不会回滚此前修改。 */
  changed: boolean;
  /** 按执行顺序累积叶命令错误，形成 dispatch 的统一返回结果。 */
  readonly errors: string[];
}

/** 组合各领域模块，串联 Command → 观察失效 → Reaction → 校验；对外提供实例 API。 */
class Runtime implements FormRuntime {
  // 固定输入与模块依赖；生命周期策略仍由各模块负责。
  /** 已接管并校验的编译产物，提供规则、表达式与锁定能力需求。 */
  readonly #prepared: PreparedForm;
  /** L3 使用的 Host 事件 / 校验器注册表快照；物料 Request 由 Adapter 接入。 */
  readonly #host: HostCapabilities;
  /** 是否冻结引擎持有的 Data / Context；不改变只读 API 契约。 */
  readonly #freeze: boolean;
  /** 实例诊断出口与有限事件查询；单轮 Journal 由 Scheduler 的 FlushContext 创建。 */
  readonly #diagnostics: DiagnosticReporter;
  /** Working Data 与配套 Scope 索引的唯一写入入口。 */
  readonly #store: DataStore;
  /** 在显式 EvaluationFrame 中求值引用 / 表达式，不自行修改状态。 */
  readonly #evaluator: Evaluator;
  /** 观察候选筛选、前后值比较与内外通知顺序。 */
  readonly #observers: ObserverRegistry;
  /** 联动入队去重、延迟启动和本轮熔断预算。 */
  readonly #scheduler: ReactionScheduler;
  /** 校验来源状态、前置依赖、异步任务资格与完整校验证明。 */
  readonly #validation: ValidationManager;

  // 可变实例状态；业务数据本身只由 DataStore 持有。
  /** Host 提供并由 Runtime 接管的环境输入，通过 replaceContext 整体替换。 */
  #context: JsonValue;
  /** 每次替换 Context 递增，供完整校验识别输入过期；不等于 Data revision。 */
  #contextRevision = 0;
  /** 生命周期终止标记；销毁后禁止继续读取 / 修改业务状态。 */
  #disposed = false;
  /** 活跃的规则 + Scope 实例及其订阅；待执行任务另由 Scheduler 持有。 */
  readonly #reactions = new Map<string, ReactionInstance>();

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
    this.#diagnostics = new DiagnosticReporter(
      traceCapacity,
      options.onDiagnostic,
      () => this.#prepared,
      () => this.#diagnosticInput(),
    );
    // 接管注册表；实例装载后不随 Host 注册字典的修改切换实现。
    const functions = Object.freeze(
      Object.fromEntries(
        Object.entries(options.functions ?? {}).map(([id, binding]) => [
          id,
          Object.freeze({
            ...binding,
            manifest: ownJson(binding.manifest) as unknown as typeof binding.manifest,
            artifact: ownJson(binding.artifact) as unknown as typeof binding.artifact,
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
    this.#prepared = loadPrepared(options.prepared, registeredFunctions);
    this.#host = Object.freeze({
      events: Object.freeze({ ...options.host?.events }),
      validators: Object.freeze({ ...options.host?.validators }),
    });
    this.#store = new DataStore(options.data, this.#freeze);
    this.#context = ownJson(options.context === undefined ? {} : options.context, this.#freeze);
    const boundFunctions = Object.freeze(
      Object.fromEntries(
        Object.keys(this.#prepared.capabilityLock.pureFunctions).map((id) => [
          id,
          registeredFunctions[id]!,
        ]),
      ),
    );
    this.#evaluator = new Evaluator(
      this.#prepared.definition.expressions ?? {},
      boundFunctions,
      this.#prepared.resources.schemas,
    );
    this.#observers = new ObserverRegistry(
      () => this.#store.capture(),
      (watch, scope, view) => this.#readWatch(watch, scope, view),
      (error) =>
        this.#diagnostics.error(
          'observer.error',
          error,
          this.#diagnostics.captureExecution('observer.effect'),
        ),
      {
        maximum: maxExecutions,
        consume: (generation) => this.#scheduler.consumeNotification(generation),
        abort: () => this.#scheduler.abortNotifications(),
      },
      (callback, scope) => {
        const trace = this.#diagnostics.execution(
          'observer',
          this.#diagnosticInput(this.#frame(scope)),
        );
        this.#diagnostics.run(trace, () => {
          try {
            const origin = this.#diagnostics.capture('observer.start');
            const returned: unknown = callback();
            observeRejection(returned, (error) => {
              if (!this.#disposed)
                this.#diagnostics.error(
                  'observer.error',
                  error,
                  trace,
                  'callback',
                  undefined,
                  origin,
                );
            });
          } catch (error) {
            this.#diagnostics.error('observer.error', error, trace, 'callback');
          }
        });
      },
    );
    this.#scheduler = new ReactionScheduler(
      maxExecutions,
      () => this.#afterReactions(),
      this.#diagnostics,
    );
    this.#validation = new ValidationManager(this.#prepared, this.#evaluator, {
      view: () => this.#store.capture(),
      contextRevision: () => this.#contextRevision,
      frame: (scope) => this.#frame(scope),
      observe: (watch, scope, callback) =>
        this.#observers.add(watch, scope, callback, true).dispose,
      publish: (paths, origin) => {
        const entry = this.#diagnostics.record('validation.change', undefined, undefined, origin);
        this.#diagnostics.withTrigger(
          {
            origin: {
              sequence: entry.sequence,
              ...(entry.round === undefined ? {} : { round: entry.round }),
            },
            input: this.#diagnosticInput(),
          },
          () => {
            if (this.#observers.validationChanged(paths) && !this.#disposed)
              this.#diagnostics.addTrigger(entry);
          },
        );
      },
      schedule: () => this.#scheduler.schedule(),
      captureOrigin: (kind, ruleId) => this.#diagnostics.capture(kind, ruleId),
      diagnostics: this.#diagnostics,
      diagnosticInput: (scope) => this.#diagnosticInput(this.#frame(scope)),
      deferEffect: (effect) => this.#observers.deferEffect(effect),
      host: this.#host,
    });
    this.#bindPublicMethods();
    this.#report('runtime.initialize', undefined, undefined, undefined, true);
    this.#refreshRuleInstances();
    this.#scheduler.schedule();
    // 公共方法保持不可覆盖；原生私有字段仍能维护实例状态。
    Object.freeze(this);
  }

  /** 从当前输入解析引用，将缺失 / 读取异常包装为结果；不会触发 flush。 */
  read(reference: Reference, scope: ScopeBinding = {}): ReadResult {
    return this.#readResult(() => this.#evaluator.reference(reference, this.#frame(scope)));
  }

  /** 返回调用时的数据根快照，不隐式 flush、等待校验或建立业务 Baseline。 */
  snapshot(): ReadonlyJson {
    this.#assertAlive();
    return this.#store.capture().root;
  }

  /** 按当前数据展开 Scope 声明，供 Host / 后续 Renderer 持有稳定成员绑定。 */
  bind(declaration?: PreparedScopeDeclaration, parent: ScopeBinding = {}): ScopeBinding[] {
    this.#assertAlive();
    return bindScopes(this.#store.capture(), declaration, ownScope(parent));
  }

  /** 在当前 Data / Context 及本次 Scope / Event 中求值单个表达式，只读不写入。 */
  evaluate(expression: Expression, scope: ScopeBinding = {}, event?: JsonValue): ReadResult {
    return this.#readResult(() =>
      this.#evaluator.expression(
        expression,
        this.#frame(ownScope(scope), event === undefined ? undefined : ownJson(event)),
      ),
    );
  }

  /** 递归求值 ValueSpec 中的表达式包装，返回 props / Command 值 / Payload 等业务 JSON。 */
  evaluateValue(
    value: ValueSpec | PreparedValueSpec,
    scope: ScopeBinding = {},
    event?: JsonValue,
  ): ReadResult {
    return this.#readResult(() =>
      this.#evaluator.value(
        value,
        this.#frame(ownScope(scope), event === undefined ? undefined : ownJson(event)),
      ),
    );
  }

  /** 同步执行 Command 并完成逐叶变化通知；Reaction 延迟调度，batch 不整体回滚。 */
  dispatch(command: Command, scope: ScopeBinding = {}, event?: JsonValue): CommandResult {
    const execution: CommandExecution = { changed: false, errors: [] };
    const binding = ownScope(scope);
    const capturedEvent = event === undefined ? undefined : ownJson(event);
    try {
      this.#executeCommand(
        ownJson(command) as unknown as Command,
        binding,
        capturedEvent,
        execution,
      );
    } catch (error) {
      execution.errors.push(String(error));
      this.#diagnostics.error('command.error', error);
    }
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
    const owned = ownJson(watches) as unknown as typeof watches;
    const subscription = this.#observers.add(owned, ownScope(scope), callback);
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
    return this.#scheduler.flush();
  }

  /** 聚合影响指定字段的当前校验来源，不发起新的校验。 */
  getValidation(field: DataReference, scope: ScopeBinding = {}): FieldValidation {
    this.#assertAlive();
    return this.#validation.field(field, scope);
  }

  /** 对本次捕获输入启动完整校验并等待结果；输入变化时返回 stale，不自动保存业务数据。 */
  validate(): Promise<FullValidationResult> {
    this.#assertAlive();
    return this.#validation.validate();
  }

  /** 整体替换 Host 环境输入，失效校验与外部读取；不伪造 Data 变化或触发 Data watch。 */
  replaceContext(input: unknown): void {
    this.#assertAlive();
    this.#context = ownJson(input, this.#freeze);
    this.#contextRevision++;
    this.#report('context.replace', undefined, undefined, undefined, true);
    this.#observers.transaction(() => {
      this.#validation.inputChanged(true);
      this.#observers.contextChanged();
    });
  }

  /** 读取实例最近诊断事件，返回独立只读数组；销毁后仍可排查最后事件。 */
  diagnostics(): readonly Diagnostic[] {
    return this.#diagnostics.read();
  }

  /** 幂等终止调度、解除订阅并撤销异步校验发布资格，保留诊断记录供排查。 */
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#scheduler.dispose();
    this.#reactions.forEach((instance) => instance.dispose());
    this.#reactions.clear();
    this.#validation.dispose();
    this.#observers.clear();
    this.#report('runtime.dispose');
  }

  /** 展开 batch 并逐叶提交；有效修改后按顺序失效校验、更新规则实例、比较观察值。 */
  #executeCommand(
    command: Command,
    scope: ScopeBinding,
    event: JsonValue | undefined,
    execution: CommandExecution,
  ): void {
    const trace = this.#diagnostics.execution(
      'command',
      this.#diagnosticInput(this.#frame(scope, event)),
    );
    this.#diagnostics.run(trace, () => {
      try {
        this.#assertAlive();
        if (this.#scheduler.hasAborted()) return;
        if (command.op === 'batch') {
          if (
            Object.keys(command).some((key) => !['op', 'commands'].includes(key)) ||
            !Array.isArray(command.commands)
          )
            throw Error('command: invalid batch');
          for (const leaf of command.commands) this.#executeCommand(leaf, scope, event, execution);
          return;
        }
        if (!validCommand(command)) throw Error('command: invalid shape');
        const before = this.#store.capture();
        const mutation = executeCommand(
          this.#store,
          this.#evaluator,
          command,
          this.#frame(scope, event),
        );
        if (!mutation.changed) return;
        execution.changed = true;
        const change = this.#diagnostics.record(
          'data.change',
          JSON.stringify(command),
          undefined,
          undefined,
          true,
        );
        this.#diagnostics.withTrigger(
          {
            origin: {
              sequence: change.sequence,
              ...(change.round === undefined ? {} : { round: change.round }),
            },
            input: this.#diagnosticInput(this.#frame(scope, event)),
          },
          () =>
            this.#observers.transaction(() => {
              this.#validation.inputChanged();
              if (this.#store.capture().topologyChanged) this.#refreshRuleInstances();
              this.#observers.dataChanged(mutation.path, before);
            }),
        );
      } catch (error) {
        const message = String(error);
        execution.errors.push(message);
        this.#diagnostics.error(
          'command.error',
          error,
          trace,
          'command',
          command as unknown as ReadonlyJson,
        );
      }
    });
  }

  /** 数据结构变化后重绑定规则；保留已有成员实例，只为新实例处理 runOnActivate。 */
  #refreshRuleInstances(): void {
    this.#validation.refresh();
    const keys = new Set<string>();
    for (const rule of this.#prepared.definition.reactions ?? []) {
      for (const scope of bindScopes(this.#store.capture(), rule.scope)) {
        const key = `${rule.id}:${bindingKey(scope)}`;
        keys.add(key);
        if (this.#reactions.has(key)) continue;
        const dispose = this.#observers.add(
          rule.watch,
          scope,
          () => this.#enqueueReaction(key),
          true,
        ).dispose;
        this.#reactions.set(key, { rule, scope, dispose, triggers: new Map() });
        if (rule.runOnActivate) this.#enqueueReaction(key);
      }
    }
    for (const [key, instance] of this.#reactions) {
      if (keys.has(key)) continue;
      instance.dispose();
      this.#reactions.delete(key);
      this.#scheduler.remove(key);
    }
  }

  /** 按实例键入队，多个 watch 失效可合并为一次待执行任务。 */
  #enqueueReaction(key: string): void {
    const instance = this.#reactions.get(key);
    if (instance) {
      const trigger = this.#diagnostics.captureTrigger(
        this.#diagnosticInput(this.#frame(instance.scope)),
      );
      instance.triggers.set(trigger.origin.sequence, trigger);
    }
    this.#scheduler.enqueue(key, () => this.#runReaction(key));
  }

  /** 读取执行时最新数据判断 when，再按声明顺序执行响应项；已失效实例直接跳过。 */
  #runReaction(key: string): void {
    const instance = this.#reactions.get(key);
    if (!instance || this.#disposed) return;
    const trace = this.#diagnostics.execution(
      'reaction',
      this.#diagnosticInput(this.#frame(instance.scope)),
      { ruleId: instance.rule.id },
      [...instance.triggers.values()],
    );
    instance.triggers.clear();
    this.#diagnostics.run(trace, () => {
      try {
        this.#report('reaction.execute', undefined, instance.rule.id);
        if (
          instance.rule.when !== undefined &&
          !this.#evaluator.boolean(instance.rule.when, this.#frame(instance.scope))
        )
          return;
        for (const action of instance.rule.then) {
          if (this.#disposed || this.#scheduler.hasAborted()) break;
          this.#executeReactionAction(action, instance.scope, instance.rule.id);
        }
      } catch (error) {
        this.#diagnostics.error('reaction.error', error, trace, 'when');
      }
    });
  }

  /** 分派数据 Command 或 Host 通知；单项异常记诊断，后续响应项继续执行。 */
  #executeReactionAction(action: ReactionAction, scope: ScopeBinding, ruleId: string): void {
    try {
      if ('type' in action) this.#emitHostEvent(action, scope, ruleId);
      else this.dispatch(action, scope);
    } catch (error) {
      this.#diagnostics.error(
        'reaction.action.error',
        error,
        undefined,
        'action',
        action as unknown as ReadonlyJson,
      );
    }
  }

  /** 捕获调用输入后同步交付 Host 事件；返回的异步任务只处理拒绝，不延长本轮 flush。 */
  #emitHostEvent(action: HostEventIntent, scope: ScopeBinding, ruleId: string): void {
    const callback =
      this.#host.events && Object.hasOwn(this.#host.events, action.event)
        ? this.#host.events[action.event]
        : undefined;
    if (!callback) {
      this.#report('host.event.missing', action.event, ruleId);
      return;
    }
    const input = this.#frame(scope);
    const trace = this.#diagnostics.execution('host.event', this.#diagnosticInput(input), {
      ruleId,
    });
    this.#diagnostics.run(trace, () => {
      let phase = 'payload';
      const origin = this.#diagnostics.capture('host.event.start', ruleId);
      try {
        const payload =
          action.payload === undefined ? undefined : this.#evaluator.value(action.payload, input);
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
              this.#diagnostics.run(trace, () =>
                this.#readResult(() => this.#evaluator.reference(reference, input)),
              ),
          }),
        );
        observeRejection(returned, (error) => {
          if (!this.#disposed)
            this.#diagnostics.error(
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
        this.#diagnostics.error(
          'reaction.action.error',
          error,
          trace,
          phase,
          action as unknown as ReadonlyJson,
          origin,
        );
      }
    });
  }

  /** 每次联动队列排空后进入增量校验，结果变化可经观察器重新触发联动。 */
  #afterReactions(): boolean {
    this.#validation.run();
    return this.#validation.hasPending();
  }

  /** 读取观察投影：Data 值、数组成员顺序或字段校验状态，供 Registry 比较前后差异。 */
  #readWatch(
    watch: PreparedReactionWatch,
    scope: ScopeBinding,
    view: ReadView,
  ): JsonValue | undefined {
    if (watch.source === 'validation')
      return this.#validationProjection(watch.observe, this.#validation.field(watch.field, scope));
    const path = resolvePath(view, watch, scope);
    if (watch.aspect === 'structure') {
      const ids = view.scopes.membersOf(path);
      return ids ? ownJson(ids) : undefined;
    }
    const result = readAt(view.root, path);
    return result.kind === 'value' ? result.value : undefined;
  }

  /** 捕获本次求值的 Data / Context 输入；不是 flush 上下文，也不在表达式之间累计状态。 */
  #frame(scope: ScopeBinding = {}, event?: JsonValue): EvaluationFrame {
    return {
      view: this.#store.capture(),
      context: this.#context,
      scope,
      ...(event === undefined ? {} : { event }),
      validation: (reference, binding) => {
        const value = this.#validationProjection(
          reference.observe,
          this.#validation.field(reference.field, binding),
        );
        this.#diagnostics.noteRead({ reference: reference as unknown as ReadonlyJson, value });
        return value;
      },
    };
  }

  /** 只捕获输入与当时物理路径，异步回报不重新读取当前 Store。 */
  #diagnosticInput(frame = this.#frame()): DiagnosticInput {
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
      contextRevision: this.#contextRevision,
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
  #readResult(read: () => JsonValue): ReadResult {
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
    this.#diagnostics.record(kind, message, ruleId, origin, trigger);
  }

  /** 绑定 this，使公开方法可解构或作为回调传递；构造后再冻结公开实例。 */
  #bindPublicMethods(): void {
    // 保留原入口方法可解构 / 直接作为回调传递的行为。
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
