import type { JsonValue } from '@form-engine/protocol';

/** 对已校验的 JSON 按对象键排序序列化，用于契约摘要和资源身份比较；不校验外部输入。 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(',')}}`;
  return JSON.stringify(value)!;
}

/**
 * 在输入边界复制接管纯 JSON，可选择递归冻结副本，不冻结 Host 的原对象。
 * 拒绝访问器、循环、非有限数、稀疏数组等非法输入；ancestors 仅跟踪当前递归链。
 */
export function ownJson(input: unknown, freeze = true, ancestors = new Set<object>()): JsonValue {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input !== 'object' || input === null) throw Error('json: unsupported value');
  if (ancestors.has(input)) throw Error('json: cyclic value');
  const array = Array.isArray(input);
  if (
    !array &&
    Object.getPrototypeOf(input) !== Object.prototype &&
    Object.getPrototypeOf(input) !== null
  )
    throw Error('json: plain objects required');
  ancestors.add(input);
  try {
    const keys = Reflect.ownKeys(input).filter((key) => !(array && key === 'length'));
    if (keys.some((key) => typeof key !== 'string')) throw Error('json: symbol key');
    if (array && (keys.length !== input.length || keys.some((key, i) => key !== String(i))))
      throw Error('json: sparse or extended array');
    const entries = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(input, key)!;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw Error('json: accessor or hidden property');
      return [key as string, ownJson(descriptor.value, freeze, ancestors)] as const;
    });
    const value: JsonValue = array ? entries.map((entry) => entry[1]) : Object.fromEntries(entries);
    if (freeze) Object.freeze(value);
    return value;
  } finally {
    ancestors.delete(input);
  }
}

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
