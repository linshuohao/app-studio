/** Scope 元数据的不可变哈希表节点；仅复制命中分支，旧版本不链接到新旧版本链。 */
interface Node<V> {
  readonly branches?: ReadonlyMap<number, Node<V>>;
  readonly values?: ReadonlyMap<string, V>;
}

/** FNV-1a 的 32 位散列；完整键仍保留在叶 Map，散列冲突不会混淆成员。 */
function hash(key: string): number {
  let value = 2166136261;
  for (let index = 0; index < key.length; index++)
    value = Math.imul(value ^ key.charCodeAt(index), 16777619);
  return value >>> 0;
}

/**
 * Scope 内部的持久化哈希目录，7 层、每层最多 32 个分支；叶节点用原生 Map 处理碰撞。
 * 普通 Map 的整体复制会让一次尾插扫描全部成员，此处仅复制命中路径以保存旧 ReadView。
 * 不提供通用容器 API，不保留版本链；顺序事实仍由集合中的数组拥有。
 */
export class ScopeTable<V> {
  /** 根节点只引用本版本可达的哈希分支。 */
  constructor(private readonly root: Node<V> = {}) {}

  /** 平均常量层数定位；完整键校验防止同 hash 的不同 ID 相互覆盖。 */
  get(key: string): V | undefined {
    const code = hash(key);
    let node: Node<V> | undefined = this.root;
    for (let level = 0; level < 7; level++) node = node?.branches?.get((code >>> (level * 5)) & 31);
    return node?.values?.get(key);
  }
  /** 查询元数据身份是否存在；本目录不接纳 undefined 值。 */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /** 返回新目录，共享未命中的分支；删除时裁剪空节点，不积累失活成员。 */
  private update(key: string, value: V | undefined): ScopeTable<V> {
    if (this.get(key) === value) return this;
    const code = hash(key);
    const edit = (old: Node<V> | undefined, level: number): Node<V> | undefined => {
      if (level === 7) {
        const values = new Map(old?.values);
        if (value === undefined) values.delete(key);
        else values.set(key, value);
        return values.size ? { values } : undefined;
      }
      const slot = (code >>> (level * 5)) & 31;
      const branches = new Map(old?.branches);
      const child = edit(branches.get(slot), level + 1);
      if (child) branches.set(slot, child);
      else branches.delete(slot);
      return branches.size ? { branches } : undefined;
    };
    return new ScopeTable(edit(this.root, 0));
  }
  /** 写入一个成员 / 集合条目，复用无关哈希分支。 */
  set(key: string, value: V): ScopeTable<V> {
    return this.update(key, value);
  }
  /** 删除失活条目；不存在时直接复用目录。 */
  delete(key: string): ScopeTable<V> {
    return this.update(key, undefined);
  }

  /** 仅用于被替换成员子树的清理 / 构建；普通成员查询不遍历此迭代器。 */
  *entries(): IterableIterator<[string, V]> {
    const pending = [this.root];
    while (pending.length) {
      const node = pending.pop()!;
      if (node.values) yield* node.values;
      if (node.branches) pending.push(...node.branches.values());
    }
  }
}
