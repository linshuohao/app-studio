import type { JsonValue } from '../common.js';

/** 只登记本模块实际检查、复制并递归冻结的值；外部 Object.freeze 不是接管凭据。 */
const capturedValues = new WeakSet<object>();

/** 外部输入或数据替换需要独立副本；保持替换对象 / 数组的原有观察与成员身份语义。 */
export function copyJson(input: unknown, freeze = true): JsonValue {
  return visitJson(input, freeze, false, new Set());
}

/**
 * 求值过程中接管新值，并复用已验证且不可变的子值，避免每个父容器再复制整棵子树。
 * 不代替写入操作的 copyJson，也不根据外部的浅冻结状态跳过检查。
 */
export function captureJson(input: unknown): JsonValue {
  return visitJson(input, true, true, new Set());
}

/** 拒绝访问器、循环、非有限数与稀疏数组；ancestors 只跟踪当前递归链。 */
function visitJson(
  input: unknown,
  freeze: boolean,
  reuse: boolean,
  ancestors: Set<object>,
): JsonValue {
  if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input !== 'object' || input === null) throw Error('json: unsupported value');
  if (reuse && capturedValues.has(input)) return input as JsonValue;
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
      return [key as string, visitJson(descriptor.value, freeze, reuse, ancestors)] as const;
    });
    const value: JsonValue = array ? entries.map((entry) => entry[1]) : Object.fromEntries(entries);
    if (freeze) {
      Object.freeze(value);
      capturedValues.add(value);
    }
    return value;
  } finally {
    ancestors.delete(input);
  }
}
