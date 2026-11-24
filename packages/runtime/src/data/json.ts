import type { JsonValue } from '@form-engine/protocol';

export { canonicalJson } from '@form-engine/protocol/internal/json';

// 所有引擎包复用同一份接管凭据；业务写入仍用独立复制，求值才允许复用只读子值。
export { captureJson, copyJson } from '@form-engine/protocol/internal/json';

/** 冻结内部已构造的数据树，跳过已冻结的共享子树；本函数不复制数据。 */
export function protect<T extends JsonValue>(value: T, freeze: boolean): T {
  if (freeze && value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach((item) => protect(item, true));
    Object.freeze(value);
  }
  return value;
}

/** 将一个属性名编码为 JSON Pointer 片段，避免属性中的 ~ 和 / 改变路径含义。 */
export const escapePart = (part: string) => part.replace(/~/g, '~0').replace(/\//g, '~1');
/** 校验并解码 JSON Pointer；空字符串表示根节点，非法转义直接抛错。 */
export function parts(pointer: string): string[] {
  if (!/^(?:\/(?:[^~/]|~[01])*)*$/.test(pointer)) throw Error('pointer: invalid JSON Pointer');
  return pointer === ''
    ? []
    : pointer
        .slice(1)
        .split('/')
        .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
}
/** 将属性名 / 数组下标转义后追加到父路径。 */
export const childPath = (path: string, key: string | number) =>
  `${path}/${escapePart(String(key))}`;
/** 判断路径是否相同或存在祖先关系，按 / 边界匹配，根包含所有路径。 */
export const containsPath = (parent: string, child: string) =>
  parent === '' || child === parent || child.startsWith(`${parent}/`);
/** 判断修改路径与观察路径是否有祖先 / 后代重叠，用于筛选受影响观察者。 */
export const overlaps = (a: string, b: string) => containsPath(a, b) || containsPath(b, a);
/** 内部读取结果；missing 独立于合法 JSON 值 null / false / 0。 */
export type ReadResult = { kind: 'value'; value: JsonValue } | { kind: 'missing'; value?: never };
/** 只读自有属性，不沿原型链查找；路径不存在返回 missing，非法 Pointer 抛错。 */
export function readAt(root: JsonValue, pointer: string): ReadResult {
  let value = root;
  for (const key of parts(pointer)) {
    if (
      value === null ||
      typeof value !== 'object' ||
      !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(key))
    )
      return { kind: 'missing' };
    value = (value as Record<string, JsonValue>)[key]!;
  }
  return { kind: 'value', value };
}

/**
 * 复制修改路径上的容器并返回新根，其他子树共享；无变化时复用原引用。
 * replacement 缺省表示删除对象属性，不能删除根、隐式建父节点或制造数组空洞。
 * replacement 必须已由调用方接管；此处不发布状态，也不维护成员身份。
 */
export function updateAt(root: JsonValue, pointer: string, replacement?: JsonValue): JsonValue {
  const path = parts(pointer);
  if (!path.length) {
    if (replacement === undefined) throw Error('command: cannot remove root');
    return replacement;
  }
  // 自叶节点向根重建路径；所有检查和复制都完成后，调用方才有可提交的新根。
  const recurse = (value: JsonValue, depth: number): JsonValue => {
    if (value === null || typeof value !== 'object')
      throw Error('command: parent is not a container');
    const key = path[depth]!;
    if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
      throw Error('command: invalid array member');
    const final = depth === path.length - 1;
    if (!final && !Object.hasOwn(value, key)) throw Error('command: missing parent');
    if (final && replacement === undefined && Array.isArray(value))
      throw Error('command: use array.remove');
    if (final && replacement === undefined && !Object.hasOwn(value, key)) return value;
    const next = final
      ? replacement
      : recurse((value as Record<string, JsonValue>)[key]!, depth + 1);
    if (Object.hasOwn(value, key) && Object.is((value as Record<string, JsonValue>)[key], next))
      return value;
    if (Array.isArray(value)) {
      const copy = value.slice();
      copy[Number(key)] = next!;
      return copy;
    }
    const copy = Object.fromEntries(Object.entries(value));
    if (next === undefined) delete copy[key];
    else
      Object.defineProperty(copy, key, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    return copy;
  };
  return recurse(root, 0);
}

/** JSON 结构等值保留 Object.is 的标量语义，用于执行兼容而非序列化摘要。 */
export function equalJson(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (
    !a ||
    !b ||
    typeof a !== 'object' ||
    typeof b !== 'object' ||
    Array.isArray(a) !== Array.isArray(b)
  )
    return false;
  const left = Object.keys(a),
    right = Object.keys(b);
  return (
    left.length === right.length &&
    left.every(
      (key) =>
        Object.hasOwn(b, key) &&
        equalJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}
