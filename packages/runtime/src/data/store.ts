import type { JsonValue } from '@form-engine/protocol';
import { type ReadView } from '../scope/registry.js';
import { ScopeIndex } from '../scope/index.js';
import { ownJson, protect, readAt, updateAt, childPath } from './json.js';

/** 进程内的 Store 实例编号，用于给成员 ID 分配独立前缀。 */
let runtimeSequence = 0;
/** 已解析为当前下标的数组结构操作；稳定 Scope 锚点由 Command 执行层先解析。 */
export type ArrayEdit =
  | { kind: 'insert'; to: number; value: unknown }
  | { kind: 'remove'; from: number }
  | { kind: 'move'; from: number; to: number };
/**
 * Working Data 的唯一写入者，同时维护数据根、数据版本和数组成员身份索引。
 * 输入复制接管，内部不可变更新；有效修改发布新 ReadView，旧快照可继续读取。
 * 本类只提交 Data + Scope，不求值表达式、不通知订阅，也不执行联动或校验。
 */
export class DataStore {
  /** 当前数据根、版本及成员索引；commit 整体替换，不能原地修改旧视图。 */
  private view: ReadView;
  /** 实例内数组成员 ID 的分配序号；移动保留 ID，新增 / 替换分配新 ID。 */
  private sequence = 0;
  /** 区分不同 Runtime 的成员身份，避免跨实例误用同一 Scope 句柄。 */
  private readonly prefix = `runtime-${++runtimeSequence}:`;
  /** 分配不复用的成员 ID；仅索引新成员时调用，业务 JSON 中不加入该字段。 */
  private id = () => this.prefix + ++this.sequence;
  /** 接管初值并建立 revision=0 的首个读视图；不会按 Schema 填默认值或执行校验。 */
  constructor(
    input: unknown,
    /** 是否冻结引擎拥有的数据；关闭后调用方仍必须遵守只读契约。 */
    private readonly freeze = true,
  ) {
    const root = ownJson(input, freeze);
    this.view = {
      runtimeId: this.prefix,
      root,
      revision: 0,
      topologyChanged: true,
      scopes: new ScopeIndex().replace('', root, this.id),
    };
  }
  /** 返回当前版本的稳定读视图，用于求值、变化比较和异步校验输入捕获。 */
  capture(): ReadView {
    return this.view;
  }
  /** 按绝对 JSON Pointer 读当前数据；返回 value / missing，不把缺失与 null 混同。 */
  read(path: string) {
    return readAt(this.view.root, path);
  }
  /**
   * 接管替换值并写入指定路径，返回是否产生有效修改；不隐式创建缺失的父节点。
   * 替换范围内的数组成员重新建立身份，范围之外的既有成员保留身份。
   */
  write(path: string, value: unknown) {
    const owned = ownJson(value, this.freeze);
    return this.commit(updateAt(this.view.root, path, owned), path);
  }
  /** 删除对象属性；不存在时返回 false，删除根或数组成员须走其他明确入口。 */
  remove(path: string) {
    return this.commit(updateAt(this.view.root, path), path);
  }
  /**
   * 浅合并两个对象：仅覆盖输入提供的直接属性，不递归合并。
   * 全部属性及索引构造完成后才发布；未覆盖的子树与其中的数组成员身份保留。
   */
  patch(path: string, input: unknown) {
    const current = this.read(path),
      value = ownJson(input, this.freeze);
    if (
      current.kind !== 'value' ||
      current.value === null ||
      typeof current.value !== 'object' ||
      Array.isArray(current.value) ||
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value)
    )
      throw Error('command: patch needs objects');
    let next = this.view.root;
    for (const [key, entry] of Object.entries(value)) {
      const child = path + '/' + key.replace(/~/g, '~0').replace(/\//g, '~1');
      next = updateAt(next, child, entry);
    }
    const before = this.view;
    if (Object.is(next, before.root)) return false;
    let scopes = before.scopes;
    let topologyChanged = false;
    for (const [key, entry] of Object.entries(value)) {
      const child = childPath(path, key),
        previous = readAt(before.root, child).value;
      topologyChanged ||= this.shapeChanged(previous, entry);
      if (this.hasStructure(previous) || this.hasStructure(entry))
        scopes = scopes.replace(child, entry, this.id);
    }
    this.view = {
      ...before,
      root: protect(next, this.freeze),
      revision: before.revision + 1,
      scopes,
      topologyChanged,
    };
    return true;
  }
  /**
   * 原子执行数组插入 / 删除 / 移动，并同步修改成员顺序表；移动目的下标是最终位置。
   * 移动携带原 ID，插入分配新 ID，删除移除 ID；非法位置抛错且不发布中间数据。
   */
  array(path: string, operation: ArrayEdit) {
    const current = this.read(path);
    if (current.kind !== 'value' || !Array.isArray(current.value))
      throw Error('command: target is not an array');
    const items = current.value.slice(),
      ids = [...this.view.scopes.membersOf(path)!];
    const valid = (index: number, upper: number) =>
      Number.isInteger(index) && index >= 0 && index <= upper;
    if (operation.kind !== 'insert' && !valid(operation.from, items.length - 1))
      throw Error('command: invalid source index');
    if (
      operation.kind !== 'remove' &&
      !valid(operation.to, items.length - (operation.kind === 'move' ? 1 : 0))
    )
      throw Error('command: invalid destination index');
    if (operation.kind === 'move') {
      if (operation.from === operation.to) return false;
      items.splice(operation.to, 0, items.splice(operation.from, 1)[0]!);
      ids.splice(operation.to, 0, ids.splice(operation.from, 1)[0]!);
    } else if (operation.kind === 'insert') {
      items.splice(operation.to, 0, ownJson(operation.value, this.freeze));
      ids.splice(operation.to, 0, this.id());
    } else {
      items.splice(operation.from, 1);
      ids.splice(operation.from, 1);
    }
    const scopes = this.view.scopes.reorder(
      path,
      ids,
      operation.kind === 'insert'
        ? { id: ids[operation.to]!, value: items[operation.to]! }
        : undefined,
      this.id,
      {
        start:
          operation.kind === 'insert'
            ? operation.to
            : operation.kind === 'remove'
              ? operation.from
              : Math.min(operation.from, operation.to),
        end: operation.kind === 'move' ? Math.max(operation.from, operation.to) : ids.length - 1,
        ...(operation.kind === 'remove'
          ? { removed: this.view.scopes.membersOf(path)![operation.from]! }
          : {}),
      },
    );
    return this.commit(updateAt(this.view.root, path, items), undefined, scopes);
  }
  /** 标量不可能持有成员目录，直接复用整个 ScopeIndex。 */
  private hasStructure(value: JsonValue | undefined): boolean {
    return value !== null && typeof value === 'object';
  }
  /** 只比较被替换子树的可绑定形状；不将普通标量值变化误判为实例生命周期变化。 */
  private shapeChanged(before: JsonValue | undefined, after: JsonValue | undefined): boolean {
    if (before === after) return false;
    if (
      before === undefined ||
      after === undefined ||
      Array.isArray(before) ||
      Array.isArray(after)
    )
      return true;
    if (this.hasStructure(before) !== this.hasStructure(after)) return true;
    if (!this.hasStructure(before)) return false;
    const oldObject = before as Record<string, JsonValue>,
      newObject = after as Record<string, JsonValue>;
    const keys = Object.keys(oldObject);
    return (
      keys.length !== Object.keys(newObject).length ||
      keys.some(
        (key) =>
          !Object.hasOwn(newObject, key) || this.shapeChanged(oldObject[key], newObject[key]),
      )
    );
  }
  /**
   * 先构造配套成员索引，再一次替换当前 ReadView 并递增 revision。
   * root 引用不变时返回 false；replaced 标记替换子树，scopes 可携带已完成的结构索引。
   */
  private commit(root: JsonValue, replaced?: string, scopes?: ScopeIndex) {
    if (Object.is(root, this.view.root)) return false;
    const topologyChanged =
      scopes !== undefined ||
      (replaced !== undefined &&
        this.shapeChanged(readAt(this.view.root, replaced).value, readAt(root, replaced).value));
    if (!scopes) {
      scopes = this.view.scopes;
      if (replaced !== undefined) {
        const previous = readAt(this.view.root, replaced).value,
          next = readAt(root, replaced).value;
        if (this.hasStructure(previous) || this.hasStructure(next))
          scopes = scopes.replace(replaced, next, this.id);
      }
    }
    this.view = {
      runtimeId: this.view.runtimeId,
      root: protect(root, this.freeze),
      revision: this.view.revision + 1,
      scopes,
      topologyChanged,
    };
    return true;
  }
}
