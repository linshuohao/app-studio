import type { JsonValue } from '@form-engine/protocol';
import type { PreparedReactionWatch } from '@form-engine/protocol/prepared';
import { parts, type ReadResult } from '../data/json.js';
import {
  bindingAlive,
  resolvePath,
  resolveLocation,
  type ReadView,
  type ScopeBinding,
} from '../scope/registry.js';

/** Pointer 前缀树节点，只保存路径结构和订阅 ID，不保存业务值。 */
class Node {
  /** 按解码后的单个路径片段连接后代，避免字符串前缀误匹配。 */
  readonly children = new Map<string, Node>();
  /** 恰好注册在此路径上的订阅；祖先 / 后代命中由 PathIndex 合并。 */
  readonly ids = new Set<number>();
}
/** 路径前缀索引：修改祖先或后代都可能影响订阅，命中后仍需比较实际值。 */
class PathIndex {
  /** 空路径节点，同时承载观察整个数据根的订阅。 */
  private readonly root = new Node();
  /** 把一条实际路径与订阅 ID 加入前缀树，Scope 移动后的路径由 Registry 重建。 */
  add(path: string, id: number) {
    let node = this.root;
    for (const part of parts(path)) {
      if (!node.children.has(part)) node.children.set(part, new Node());
      node = node.children.get(part)!;
    }
    node.ids.add(id);
  }
  /** 解除一个订阅的实际路径，并裁剪空分支，不重建其他订阅。 */
  remove(path: string, id: number) {
    let node = this.root;
    const chain: Array<{ parent: Node; part: string; child: Node }> = [];
    for (const part of parts(path)) {
      const child = node.children.get(part);
      if (!child) return;
      chain.push({ parent: node, part, child });
      node = child;
    }
    node.ids.delete(id);
    for (const { parent, part, child } of chain.reverse()) {
      if (child.ids.size || child.children.size) break;
      parent.children.delete(part);
    }
  }
  /** 收集与修改路径相同、祖先或后代的订阅 ID；候选命中不代表观察值已变化。 */
  candidates(path: string): Set<number> {
    const result = new Set(this.root.ids);
    let node: Node | undefined = this.root;
    for (const part of parts(path)) {
      node = node.children.get(part);
      if (!node) return result;
      node.ids.forEach((id) => result.add(id));
    }
    const descend = (current: Node) => {
      current.ids.forEach((id) => result.add(id));
      current.children.forEach(descend);
    };
    descend(node);
    return result;
  }
}
/** 比较用读取结果：值 / 缺失 / 定位失败，三种状态之间的变化也属于观察变化。 */
type Observed = ReadResult | { kind: 'error'; value?: never };
/** 一次观察注册；values 保存上次比较值，供下一次变化判断，不是业务历史。 */
interface Entry {
  /** 实例内订阅序号，同时用于稳定的通知排序。 */
  readonly id: number;
  /** 注册时的数据版本，用来判断能否从 Command 的 before 视图读取旧值。 */
  readonly createdRevision: number;
  /** 已接管的观察声明，一个订阅可组合多个 Data / Validation 观察源。 */
  readonly watches: readonly PreparedReactionWatch[];
  /** 观察对象的稳定成员绑定，解析位置随 ReadView 变化。 */
  readonly scope: ScopeBinding;
  /** 无参数失效通知；具体值由消费方再次读取。 */
  readonly callback: () => void;
  /** 内部订阅先同步失效 / 入队；外部回调延迟到整个 Command 的内部更新完成。 */
  readonly internal: boolean;
  /** 最近比较结果；Validation 无历史 ReadView，依靠此处保存前次投影。 */
  values: Observed[];
  /** 此注册拥有的索引项，解除 / 移动时按项移除，避免重建整个 Registry。 */
  readonly indexed: Array<{ index: PathIndex; path: string }>;
}
/** 统一管理 Data / Validation 订阅，隔离内部失效处理与可重入的 Host 回调。 */
export class ObserverRegistry {
  /** 订阅 ID 分配器，解除订阅后不复用。 */
  private next = 0;
  /** 当前活跃注册；实际投递前再次查验，避免通知已解除的订阅。 */
  private entries = new Map<number, Entry>();
  /** Scope 已移除的订阅；加入最后一次比较，投递后由订阅生命周期清理。 */
  private retired = new Set<number>();
  /** 两种观察源分别索引；字段路径相同不意味着观察的是同一个状态。 */
  private dataIndex = new PathIndex();
  /** Validation 的字段路径索引；Data 结构变化也可能改变字段状态定位。 */
  private validationIndex = new PathIndex();
  /** 成员绑定的位置索引：即使只观察全局字段，删除该成员也能找到对应订阅。 */
  private bindingIndex = new PathIndex();
  /** 嵌套 transaction 深度，归零后才允许向外投递，避免暴露 Command 中间状态。 */
  private deliveryDepth = 0;
  /** 正在投递时，重入产生的回调继续排队，避免递归开启另一轮投递。 */
  private delivering = false;
  /** 等待投递的外部回调 / 取消副作用；不是 Scheduler 的 Reaction 队列。 */
  private deliveries: Array<{ effect: () => void; generation: number }> = [];
  /** 当前投递的反馈代次；只有该回调写回产生的新副作用才进入下一代。 */
  private generation = 0;
  /** 注入读环境与错误出口，观察器自身不拥有 Data 或校验结果。 */
  constructor(
    /** 取得最新一致的 Data + Scope 读视图。 */
    private readonly view: () => ReadView,
    /** 在指定视图和 Scope 中读取一项观察投影。 */
    private readonly read: (
      watch: PreparedReactionWatch,
      scope: ScopeBinding,
      view: ReadView,
    ) => JsonValue | undefined,
    /** 隔离外部回调异常，后续通知仍继续。 */
    private readonly report: (error: unknown) => void,
    /** 单次同步投递上限及活动 Flush 的共同检查点；不把通知改成异步。 */
    private readonly deliveryBudget: {
      readonly maximum: number;
      readonly consume: (generation: number) => boolean;
      readonly abort: () => void;
    },
    /** 在回调入口固定诊断输入；回调写回后抛错仍能还原原调用现场。 */
    private readonly runCallback: (callback: () => void, scope: ScopeBinding) => void,
  ) {}
  /** 批量读取投影并规范化为比较结果；无效 Scope 不向通知流程抛异常。 */
  private values(entry: Pick<Entry, 'watches' | 'scope'>, view: ReadView): Observed[] {
    if (!bindingAlive(view, entry.scope)) return entry.watches.map(() => ({ kind: 'error' }));
    return entry.watches.map((watch) => {
      try {
        const value = this.read(watch, entry.scope, view);
        return value === undefined ? { kind: 'missing' } : { kind: 'value', value };
      } catch {
        return { kind: 'error' };
      }
    });
  }
  /** 登记后完成初读和索引，返回初值及解除句柄；登记期间不主动触发 callback。 */
  add(
    watches: readonly PreparedReactionWatch[],
    scope: ScopeBinding,
    callback: () => void,
    internal = false,
  ) {
    const entry: Entry = {
      id: ++this.next,
      createdRevision: this.view().revision,
      watches,
      scope,
      callback,
      internal,
      values: [],
      indexed: [],
    };
    this.entries.set(entry.id, entry);
    entry.values = this.values(entry, this.view());
    this.index(entry);
    return {
      values: entry.values,
      dispose: () => {
        this.entries.delete(entry.id);
        this.retired.delete(entry.id);
        this.unindex(entry);
      },
    };
  }
  /** 将稳定绑定解析成当前物理路径后索引；已删除成员登记为待退休订阅。 */
  private index(entry: Entry) {
    if (!bindingAlive(this.view(), entry.scope)) {
      this.retired.add(entry.id);
      return;
    }
    for (const location of Object.values(entry.scope)) {
      if (!location.member) continue;
      const path = resolveLocation(this.view(), location);
      this.bindingIndex.add(path, entry.id);
      entry.indexed.push({ index: this.bindingIndex, path });
    }
    for (const watch of entry.watches) {
      try {
        const validation = watch.source === 'validation';
        const index = validation ? this.validationIndex : this.dataIndex;
        const path = resolvePath(this.view(), validation ? watch.field : watch, entry.scope);
        index.add(path, entry.id);
        entry.indexed.push({ index, path });
      } catch {
        /* 已移除 Scope 的清理由其所属规则 / 订阅生命周期负责。 */
      }
    }
  }
  /** 只解除本订阅拥有的索引项，不扫描其他注册。 */
  private unindex(entry: Entry) {
    for (const { index, path } of entry.indexed) index.remove(path, entry.id);
    entry.indexed.length = 0;
  }
  /** Data 提交后查候选、更新位置索引，再结合 before / 当前视图比较同一逻辑成员。 */
  dataChanged(path: string, before: ReadView) {
    const ids = this.dataIndex.candidates(path);
    this.validationIndex.candidates(path).forEach((id) => ids.add(id));
    // 标量编辑不改变成员位置；结构变化仅重定位修改路径相关的绑定 / 观察项。
    if (before.scopes !== this.view().scopes) {
      this.bindingIndex.candidates(path).forEach((id) => ids.add(id));
      for (const id of ids) {
        const entry = this.entries.get(id);
        if (entry) {
          this.unindex(entry);
          this.index(entry);
        }
      }
    }
    this.retired.forEach((id) => ids.add(id));
    this.notify(ids, before);
  }
  /** 校验来源变化时只比较相关 Validation 订阅，避免影响只观察 Data 的规则。 */
  validationChanged(paths: readonly string[]) {
    const ids = new Set<number>();
    paths.forEach((path) => this.validationIndex.candidates(path).forEach((id) => ids.add(id)));
    return this.notify(ids);
  }
  /** Context 是管理输入，通知外部重新读取，不伪造 Data / Validation watch 变化。 */
  contextChanged() {
    for (const entry of [...this.entries.values()])
      if (!entry.internal) {
        entry.values = this.values(entry, this.view());
        this.deferEffect(() => this.deliver(entry));
      }
  }
  /** 事务内同步维护内部失效；最外层结束后再交付外部回调及取消副作用，不提供回滚。 */
  transaction<T>(operation: () => T): T {
    this.deliveryDepth++;
    try {
      return operation();
    } finally {
      this.deliveryDepth--;
      this.drainDeliveries();
    }
  }
  /** 排队外部副作用；无事务且未投递时立即排空，重入时追加到当前投递队列。 */
  deferEffect(effect: () => void) {
    this.deliveries.push({ effect, generation: this.delivering ? this.generation + 1 : 0 });
    this.drainDeliveries();
  }
  /** 按顺序执行外部副作用，隔离单项错误，并用 delivering 防止递归开启投递循环。 */
  private drainDeliveries() {
    if (this.deliveryDepth || this.delivering) return;
    this.delivering = true;
    try {
      while (this.deliveries.length) {
        const { effect, generation } = this.deliveries.shift()!;
        if (generation >= this.deliveryBudget.maximum || !this.deliveryBudget.consume(generation)) {
          // 旧投递不能延续到下一次交互；已完成的数据修改不回滚。
          this.deliveries = [];
          // 最后通知即使被丢弃，失效 Scope 的清理也不能留到下次交互。
          for (const id of this.retired) {
            const entry = this.entries.get(id);
            if (entry) {
              this.entries.delete(id);
              this.unindex(entry);
            }
          }
          this.retired.clear();
          this.deliveryBudget.abort();
          break;
        }
        this.generation = generation;
        try {
          effect();
        } catch (error) {
          this.report(error);
        }
      }
    } finally {
      this.delivering = false;
      this.generation = 0;
    }
  }
  /** 通知前检查仍活跃；失效成员交付最后通知后移除，不把回调错误扩散到其他订阅。 */
  private deliver(entry: Entry) {
    if (!this.entries.has(entry.id)) return;
    try {
      this.runCallback(entry.callback, entry.scope);
    } catch (error) {
      this.report(error);
    }
    if (!bindingAlive(this.view(), entry.scope)) {
      this.entries.delete(entry.id);
      this.retired.delete(entry.id);
      this.unindex(entry);
    }
  }
  /**
   * 先完成全部候选的前后比较与缓存更新，再交付内部 / 外部通知，防止重入读到半状态。
   * Data 值按 Object.is，结构顺序与校验投影按 JSON 内容比较；状态种类变化也会通知。
   */
  private notify(ids: Set<number>, before?: ReadView) {
    const candidates = [...ids]
      .map((id) => this.entries.get(id))
      .filter((entry): entry is Entry => !!entry)
      .sort((a, b) => Number(b.internal) - Number(a.internal) || a.id - b.id);
    const nextView = this.view();
    const ready: Entry[] = [];
    // 在任何可重入回调开始前，完成整条 Command 的比较。
    for (const entry of candidates) {
      if (!this.entries.has(entry.id)) continue;
      const previous =
        before && entry.createdRevision <= before.revision
          ? entry.watches.map((watch, i) =>
              watch.source === 'data'
                ? this.values({ watches: [watch], scope: entry.scope }, before)[0]!
                : entry.values[i]!,
            )
          : entry.values;
      const next = this.values(entry, nextView);
      // Scope 终止本身就是最后一次失效，即使没有 Data watch 也必须交付并清理。
      const changed =
        this.retired.has(entry.id) ||
        next.some((value, i) => {
          const old = previous[i]!;
          if (old.kind !== value.kind) return true;
          const watch = entry.watches[i]!;
          if (
            watch.source === 'validation' ||
            (watch.source === 'data' && watch.aspect === 'structure')
          )
            return JSON.stringify(old.value) !== JSON.stringify(value.value);
          return !Object.is(old.value, value.value);
        });
      entry.values = next;
      if (changed) ready.push(entry);
    }
    for (const entry of ready) {
      if (entry.internal) this.deliver(entry);
      else this.deferEffect(() => this.deliver(entry));
    }
    return ready.some((entry) => entry.internal);
  }
  /** Runtime 销毁时解除全部观察及待投递回调，重置路径索引。 */
  clear() {
    this.entries.clear();
    this.retired.clear();
    this.deliveries = [];
    this.dataIndex = new PathIndex();
    this.validationIndex = new PathIndex();
    this.bindingIndex = new PathIndex();
  }
}
