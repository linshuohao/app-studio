import { childPath } from '../data/json.js';
import type { ReadView, ScopeLocation } from '../scope/registry.js';
export interface TopologyNode {
  /** 位置目录 ID；数组成员身份由 member 单独表达，不是下标或业务键。 */
  readonly id: string;
  readonly parentId?: string;
  readonly kind: 'object' | 'array' | 'field';
  readonly location: ScopeLocation;
  readonly path: string;
  readonly valueType: 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';
  readonly member?: string;
  readonly index?: number;
  readonly memberCount?: number;
}
export interface TopologyBudget {
  readonly maxNodes: number;
  readonly maxDepth: number;
  readonly maxTextBytes: number;
}
/** 指定 ReadView 的结构副本；只输出类型/位置/包含关系，不复制字段值，不绑定或执行规则。 */
export function describeTopology(view: ReadView, budget: TopologyBudget): readonly TopologyNode[] {
  if (
    (['maxNodes', 'maxDepth', 'maxTextBytes'] as const).some(
      (key) => !Number.isSafeInteger(budget[key]) || budget[key] < 1,
    )
  )
    throw Error('observation: invalid topology budget');
  const nodes: TopologyNode[] = [];
  let textBytes = 0;
  const charge = (text: string) => {
    if (text.length > budget.maxTextBytes - textBytes) throw Error('budget');
    for (const character of text) {
      const code = character.codePointAt(0)!;
      textBytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
    }
    if (textBytes > budget.maxTextBytes) throw Error('budget');
  };
  const walk = (
    value: ReadView['root'],
    path: string,
    location: ScopeLocation,
    parentId?: string,
    index?: number,
    depth = 0,
  ): void => {
    if (nodes.length >= budget.maxNodes || depth > budget.maxDepth) throw Error('budget');
    const id = JSON.stringify([location.member ?? null, location.path]);
    charge(id);
    charge(path);
    charge(location.path);
    if (location.member) charge(location.member);
    if (parentId) charge(parentId);
    const valueType =
      value === null
        ? 'null'
        : Array.isArray(value)
          ? 'array'
          : (typeof value as TopologyNode['valueType']);
    const kind = valueType === 'object' || valueType === 'array' ? valueType : 'field';
    const members = Array.isArray(value) ? view.scopes.membersOf(path) : undefined;
    if (Array.isArray(value) && members?.length !== value.length)
      throw Error('observation: incoherent topology');
    nodes.push(
      Object.freeze({
        id,
        kind,
        path,
        location: Object.freeze({ ...location }),
        valueType,
        ...(parentId !== undefined ? { parentId } : {}),
        ...(index !== undefined ? { member: location.member!, index } : {}),
        ...(Array.isArray(value) ? { memberCount: value.length } : {}),
      }),
    );
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++)
        walk(
          value[i]!,
          childPath(path, String(i)),
          { member: members![i]!, path: '' },
          id,
          i,
          depth + 1,
        );
    } else if (value && typeof value === 'object') {
      for (const key in value)
        if (Object.hasOwn(value, key)) {
          charge(key);
          walk(
            value[key]!,
            childPath(path, key),
            { ...location, path: childPath(location.path, key) },
            id,
            undefined,
            depth + 1,
          );
        }
    }
  };
  walk(view.root, '', { path: '' });
  return Object.freeze(nodes);
}
