import { registerDevtoolsSource, type DevtoolsSource } from '@form-engine/runtime/devtools';
import type { ReactNode } from 'react';
import type { JsonValue } from '@form-engine/protocol';
import type { Command } from '@form-engine/protocol/definition';
import type { PreparedMaterialNode } from '@form-engine/protocol/prepared';
import type { FieldValidation, ReadResult, ScopeBinding } from '@form-engine/runtime';
import type { MaterialDefinition } from '../material/types.js';
import type { RenderEnvironment } from '../renderer/create-render-environment.js';
import type { AdapterActionResult, RequestCall } from './types.js';
import { RequestBridge } from '../requests/bridge.js';
import { ExpressionProjection } from './expressions.js';
import { canonical, copyJson } from '../material/json.js';

/** 单次 React 读取的呈现快照；业务引用来自 Runtime，有效时复用对象身份。 */
interface Snapshot {
  readonly props: object;
  readonly values: Readonly<Record<string, ReadResult>>;
  readonly validation: Readonly<Record<string, FieldValidation>>;
  /** 接入 / 求值失败时的技术状态，由 Hook 抛给物料边界，不伪造成字段 Issue。 */
  readonly error?: Error;
}
/**
 * 一个物料挂载关联的接入对象：组织当前呈现值，并保护本关联的操作与请求。
 * 构造时只创建内部缓存；MaterialMount 提交后 start 建立观察，stop 撤销并清理。
 * Data、Scope 身份、校验来源仍归 Runtime；本对象不维护可独立修改的业务值副本。
 */
export class Projection {
  /** 工具只读最近快照，不额外触发纯函数求值或业务订阅。 */
  #devtools?: DevtoolsSource;
  /** 正在消费此投影的 React 监听者；可有多个 Hook，但共同复用一组底层观察。 */
  readonly #listeners = new Set<() => void>();
  /** 本轮激活建立的观察解除函数；stop 取走并清空，允许重复清理。 */
  #disposers: Array<() => void> = [];
  /** 仅代表接入已建立；alive 还必须核对词法 Scope 与所有 owners 的存活。 */
  #active = false;
  /** undefined 表示尚未读取；随后缓存最近一次正常或错误投影，不保存历史。 */
  #snapshot?: Snapshot;
  /** 本挂载的在途请求资格集合，随 stop 一起撤销。 */
  readonly #requests: RequestBridge;
  /** 每个完整表达式的输入依据与结果缓存，不承担依赖分析。 */
  readonly #expressions: ExpressionProjection;
  constructor(
    readonly environment: RenderEnvironment,
    readonly node: PreparedMaterialNode,
    readonly scope: ScopeBinding,
    readonly material: MaterialDefinition,
    readonly occurrence: string,
    readonly owners: readonly ScopeBinding[],
    readonly slots: Readonly<Record<string, ReactNode>>,
  ) {
    this.#expressions = new ExpressionProjection(node.props ?? {}, environment.runtime, scope);
    this.#requests = new RequestBridge(
      environment,
      node,
      scope,
      occurrence,
      () => this.alive,
      (event) => this.#devtools?.publish('request', event),
    );
  }
  /** 当前操作是否仍属于有效组件实例；模板参数可见性与所属成员资格分别检查。 */
  get alive() {
    return (
      this.#active &&
      this.environment.runtime.isScopeAlive(this.scope) &&
      this.owners.every((owner) => this.environment.runtime.isScopeAlive(owner))
    );
  }
  /** 幂等激活：存活、Binding、Validation 与表达式观察建立后，通知消费者复读。 */
  start = () => {
    if (this.#active) return;
    this.#active = true;
    this.#devtools = registerDevtoolsSource(
      this,
      {
        kind: 'material',
        formId: this.environment.compiledForm.definition.id,
        profile: this.environment.compiledForm.build.profile,
        label: this.node.material,
        nodeId: this.node.id,
        occurrence: this.occurrence,
      },
      () => ({
        alive: this.alive,
        scope: this.scope,
        owners: this.owners,
        snapshot: this.#snapshot,
        bindings: this.node.bindings,
        requests: this.#requests.inspect(),
      }),
      this.environment.inspectionOwner,
    );
    const qualifications = new Map(
      [this.scope, ...this.owners].map((owner) => [canonical(owner), owner]),
    );
    for (const owner of qualifications.values())
      this.#disposers.push(this.environment.runtime.observeScope(owner, this.stop).dispose);
    const fields = Object.values(this.node.bindings ?? {});
    this.#disposers.push(
      this.environment.runtime.observe(fields, this.#changed, this.scope).dispose,
    );
    this.#disposers.push(
      this.environment.runtime.observe(
        fields.map((field) => ({ source: 'validation', field, observe: 'state' })),
        this.#changed,
        this.scope,
      ).dispose,
    );
    this.#disposers.push(...this.#expressions.connect(this.#changed));
    this.#changed();
  };
  /** 先禁止旧操作和结果交付，再清理观察；不删除业务数据，也不 dispose Runtime。 */
  stop = () => {
    this.#active = false;
    this.#requests.cancelAll();
    this.#devtools?.dispose();
    this.#devtools = undefined;
    for (const dispose of this.#disposers.splice(0)) {
      try {
        dispose();
      } catch {
        /* 单项清理失败不阻断其余。 */
      }
    }
  };
  /** 只管理当前 Hook 监听者；内部子组件可独立切换，整个关联由 MaterialMount 释放。 */
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  /** 通知只是失效信号：不重放变化事件，React 随后调用 getSnapshot 读取当前权威状态。 */
  #changed = () => {
    if (!this.environment.runtime.isScopeAlive(this.scope)) this.#requests.cancelAll();
    this.#listeners.forEach((listener) => listener());
  };
  /** 只读地重组当前投影；内容未变时返回同一对象，防止外部 Store 接入无限重渲染。 */
  getSnapshot = (): Snapshot => {
    try {
      const names = Object.keys(this.material.contract.manifest.bindings ?? {});
      const values = Object.freeze(
        Object.fromEntries(
          names.map((name) => {
            const ref = this.node.bindings?.[name];
            return [
              name,
              ref ? this.environment.runtime.read(ref, this.scope) : { kind: 'missing' as const },
            ];
          }),
        ),
      );
      if (Object.values(values).some((result) => result.kind === 'error'))
        throw Error('Binding read failed');
      const validation = Object.freeze(
        Object.fromEntries(
          names.map((name) => {
            const ref = this.node.bindings?.[name];
            return [
              name,
              ref
                ? this.environment.runtime.getValidation(ref, this.scope)
                : Object.freeze({ status: 'unverified' as const, issues: Object.freeze([]) }),
            ];
          }),
        ),
      );
      const snapshot = { props: this.#expressions.read() as object, values, validation };
      if (
        this.#snapshot &&
        !this.#snapshot.error &&
        Object.is(snapshot.props, this.#snapshot.props) &&
        Object.entries(snapshot.values).every(([name, current]) => {
          const previous = this.#snapshot!.values[name];
          return (
            previous?.kind === current.kind &&
            (current.kind !== 'value' || Object.is(current.value, previous.value))
          );
        }) &&
        canonical(snapshot.validation) === canonical(this.#snapshot.validation)
      )
        return this.#snapshot;
      return (this.#snapshot = Object.freeze(snapshot));
    } catch (error) {
      if (this.#snapshot?.error && String(this.#snapshot.error) === String(error))
        return this.#snapshot;
      return (this.#snapshot = {
        props: {},
        values: {},
        validation: {},
        error: error instanceof Error ? error : Error(String(error)),
      });
    }
  };
  /** 指令交付保留 Runtime 的成功 / changed / errors；失效关联直接返回 inactive。 */
  command = (command: Command): AdapterActionResult => {
    if (!this.alive) return { kind: 'inactive' };
    try {
      return { kind: 'executed', result: this.environment.runtime.dispatch(command, this.scope) };
    } catch (error) {
      return { kind: 'error', error: String(error) };
    }
  };
  /** Binding 名解析后包装为 Literal set，避免输入数据中的 $expr 被当成配置执行。 */
  set = (name: string, input: JsonValue): AdapterActionResult => {
    if (!this.alive) return { kind: 'inactive' };
    const target = this.node.bindings?.[name];
    if (!target || !Object.hasOwn(this.node.bindings!, name))
      return { kind: 'error', error: `Unknown Binding ${name}` };
    try {
      return this.command({ op: 'set', target, value: { $literal: copyJson(input) } });
    } catch (error) {
      return { kind: 'error', error: String(error) };
    }
  };
  /** 声明事件按本次 Payload 执行已有映射；未配置响应的合法事件为空操作。 */
  emit = (name: string, payload?: JsonValue): AdapterActionResult => {
    if (!this.alive) return { kind: 'inactive' };
    if (!Object.hasOwn(this.material.contract.manifest.events ?? {}, name))
      return { kind: 'error', error: `Unknown event ${name}` };
    const intent = Object.hasOwn(this.node.on ?? {}, name) ? this.node.on![name] : undefined;
    if (!intent) return { kind: 'executed', result: { ok: true, changed: false, errors: [] } };
    try {
      return {
        kind: 'executed',
        result: this.environment.runtime.interact(intent, this.scope, payload),
      };
    } catch (error) {
      return { kind: 'error', error: String(error) };
    }
  };
  /** 请求句柄由桥接创建；本方法不缓存候选项，也不自动发数据 Command。 */
  request = (name: string, input: JsonValue): RequestCall<JsonValue> =>
    this.#requests.request(name, input);
}
