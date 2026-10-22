import type { JsonValue } from '@form-engine/protocol';
import type { ValueSpec } from '@form-engine/protocol/definition';
import { at } from '../common/pointer.js';
import { own } from '../common/object.js';

/**
 * 遍历静态 ValueSpec，得到用于 Props Schema 检查的值；不改变最终产物结构。
 * $literal 是递归边界（内部 $expr 也只是普通数据）；真正的 $expr 当前明确拒绝。
 * 尚未做表达式解析、依赖收集或 watch 生成。
 */
export function compileStaticValue(
  value: ValueSpec,
  pointer: string,
  unsupported: (pointer: string, description: string) => void,
): { supported: boolean; value: JsonValue } {
  if (value === null || typeof value !== 'object') return { supported: true, value };
  if (Array.isArray(value)) {
    const items = value.map((item, index) =>
      compileStaticValue(item, at(pointer, index), unsupported),
    );
    return {
      supported: items.every((item) => item.supported),
      value: items.map((item) => item.value),
    };
  }
  if ('$literal' in value) return { supported: true, value: value.$literal! };
  if (own(value, '$expr')) {
    unsupported(pointer, 'Reactive expressions');
    return { supported: false, value: null };
  }
  const entries = Object.entries(value).map(
    ([key, item]) => [key, compileStaticValue(item!, at(pointer, key), unsupported)] as const,
  );
  return {
    supported: entries.every(([, item]) => item.supported),
    value: Object.fromEntries(entries.map(([key, item]) => [key, item.value])),
  };
}
