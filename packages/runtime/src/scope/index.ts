import type { JsonValue } from '@form-engine/protocol';
import { childPath, parts } from '../data/json.js';
import { ScopeTable } from './table.js';

/** 一个父成员直接拥有的数组集合；order 是成员顺序的唯一权威。 */
interface Collection {
  readonly order: readonly string[];
}
/** 成员只记录父身份、相对集合路径和本层位置，父级移动不改写后代。 */
interface Member {
  readonly parent: string;
  readonly collectionPath: string;
  readonly index: number;
  readonly collections: ScopeTable<Collection>;
}
/** 创建不拥有后代集合的初始成员记录；顺序位置随后由结构操作填入。 */
const emptyMember = (): Member =>
  Object.freeze({
    parent: '',
    collectionPath: '',
    index: 0,
    collections: new ScopeTable<Collection>(),
  });

/**
 * 一个数据版本的 Scope 位置事实。所有写操作返回新实例，旧读视图保持原目录。
 * 空 ID 是数据根的所有者，业务成员 ID 由 Store 分配，绝不写进业务 JSON。
 */
export class ScopeIndex {
  /** 只持有本版本成员目录；成员内部另有直接拥有的相对集合目录。 */
  constructor(private readonly directory = new ScopeTable<Member>().set('', emptyMember())) {}

  /** 按父链按需组成绝对位置，成本随嵌套层数增长，不缓存后代绝对路径。 */
  memberPath(id: string): string | undefined {
    const suffix: string[] = [];
    while (id) {
      const member = this.directory.get(id);
      if (!member) return undefined;
      suffix.push(member.collectionPath + '/' + member.index);
      id = member.parent;
    }
    return suffix.reverse().join('');
  }
  /** 直接检查稳定成员是否仍属于本版本。 */
  alive(id: string): boolean {
    return this.directory.has(id);
  }

  /** 经过数组成员时切换稳定锚点，其余片段保留为该锚点内的相对路径。 */
  locate(path: string): { member?: string; path: string } {
    let owner = '',
      relative = '';
    for (const part of parts(path)) {
      const order = this.directory.get(owner)!.collections.get(relative)?.order;
      const member = order && /^(0|[1-9]\d*)$/.test(part) ? order[Number(part)] : undefined;
      if (member) {
        owner = member;
        relative = '';
      } else relative = childPath(relative, part);
    }
    return owner ? { member: owner, path: relative } : { path: relative };
  }
  /** 按需定位集合并返回其只读成员顺序，不复制顺序数组。 */
  membersOf(path: string): readonly string[] | undefined {
    const location = this.locate(path);
    return this.directory.get(location.member ?? '')!.collections.get(location.path)?.order;
  }
  /** 哈希定位当前本层下标，同时核对目标集合，避免线性 indexOf。 */
  memberIndex(path: string, id: string): number {
    const member = this.directory.get(id),
      location = this.locate(path);
    return member &&
      member.parent === (location.member ?? '') &&
      member.collectionPath === location.path
      ? member.index
      : -1;
  }

  /** 仅遍历新值内的数组 / 成员；常规标量写入由 Store 直接复用整个索引。 */
  replace(path: string, value: JsonValue | undefined, nextId: () => string): ScopeIndex {
    let directory = this.directory;
    const location = this.locate(path),
      owner = location.member ?? '';
    const drop = (id: string) => {
      const member = directory.get(id)!;
      for (const [, collection] of member.collections.entries())
        for (const child of collection.order) drop(child);
      directory = directory.delete(id);
    };
    let record = directory.get(owner)!;
    let collections = record.collections;
    for (const [relative, collection] of collections.entries()) {
      if (
        relative !== location.path &&
        location.path !== '' &&
        !relative.startsWith(location.path + '/')
      )
        continue;
      for (const id of collection.order) drop(id);
      collections = collections.delete(relative);
    }
    if (collections !== record.collections)
      directory = directory.set(owner, Object.freeze({ ...record, collections }));
    const add = (input: JsonValue, parent: string, relative: string) => {
      if (Array.isArray(input)) {
        const order = Object.freeze(input.map(() => nextId()));
        record = directory.get(parent)!;
        directory = directory.set(
          parent,
          Object.freeze({
            ...record,
            collections: record.collections.set(relative, Object.freeze({ order })),
          }),
        );
        input.forEach((item, index) => {
          const id = order[index]!;
          directory = directory.set(
            id,
            Object.freeze({ ...emptyMember(), parent, collectionPath: relative, index }),
          );
          add(item, id, '');
        });
      } else if (input !== null && typeof input === 'object')
        for (const [key, item] of Object.entries(input))
          add(item, parent, childPath(relative, key));
    };
    if (value !== undefined) add(value, owner, location.path);
    return directory === this.directory ? this : new ScopeIndex(directory);
  }

  /** 只更新目标集合的顺序及受影响直接成员，下代目录沿用；增删子树单独建销。 */
  reorder(
    path: string,
    order: readonly string[],
    inserted: { id: string; value: JsonValue } | undefined,
    nextId: () => string,
    affected: { start: number; end: number; removed?: string },
  ): ScopeIndex {
    const location = this.locate(path),
      parent = location.member ?? '';
    // 删除只遍历被删除成员拥有的后代，不扫描其他集合。
    let directory = this.directory;
    const drop = (id: string) => {
      for (const [, collection] of directory.get(id)!.collections.entries())
        for (const child of collection.order) drop(child);
      directory = directory.delete(id);
    };
    if (affected.removed) drop(affected.removed);
    for (let index = affected.start; index <= affected.end; index++) {
      const id = order[index]!;
      const old = directory.get(id);
      if (!old || old.index !== index)
        directory = directory.set(
          id,
          Object.freeze({
            ...(old ?? emptyMember()),
            parent,
            collectionPath: location.path,
            index,
          }),
        );
    }
    const owner = directory.get(parent)!;
    directory = directory.set(
      parent,
      Object.freeze({
        ...owner,
        collections: owner.collections.set(
          location.path,
          Object.freeze({ order: Object.freeze(order.slice()) }),
        ),
      }),
    );
    const result = new ScopeIndex(directory);
    // 已在新顺序建立新成员锚点，替换成员内容只建立其后代，保留该成员 ID。
    return inserted
      ? result.replace(result.memberPath(inserted.id)!, inserted.value, nextId)
      : result;
  }
}
