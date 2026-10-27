import type { DevtoolsSnapshot } from './types.js';
/** 工具副本限深度 / 节点数 / 字符数，不让一次检查无限复制业务对象。 */
export function copyForDevtools(input: unknown): DevtoolsSnapshot {
  let remaining = 100_000,
    nodes = 5_000,
    truncated = false;
  const seen = new WeakSet<object>();
  const cut = () => {
    truncated = true;
    return '[截断]';
  };
  const visit = (value: unknown, depth: number): unknown => {
    if (--nodes < 0 || remaining <= 0 || depth > 16) return cut();
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') {
      const size = Math.min(remaining, 8_192);
      remaining -= Math.min(size, value.length);
      return value.length > size ? ((truncated = true), value.slice(0, size) + '[截断]') : value;
    }
    if (typeof value !== 'object') return String(value);
    if (seen.has(value)) return cut();
    seen.add(value);
    const keys = Object.keys(value);
    if (keys.length > 256) truncated = true;
    const selected = keys.slice(0, 256);
    const entries: Array<[string, unknown]> = [];
    const items: unknown[] = [];
    for (const key of selected) {
      if (remaining <= 0 || nodes <= 0) {
        truncated = true;
        break;
      }
      if (Array.isArray(value)) items.push(visit(value[Number(key)], depth + 1));
      else {
        const capturedKey = key.slice(0, Math.min(1024, remaining));
        if (capturedKey.length !== key.length) truncated = true;
        remaining -= capturedKey.length;
        entries.push([capturedKey, visit((value as Record<string, unknown>)[key], depth + 1)]);
      }
    }
    const result = Array.isArray(value) ? items : Object.fromEntries(entries);
    seen.delete(value);
    return Object.freeze(result);
  };
  return Object.freeze({ value: visit(input, 0), truncated });
}
