import type { JsonValue } from '@form-engine/protocol';
import { copyJson as copyOwnedJson } from '@form-engine/protocol/internal/json';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/** 延续 Renderer 的错误文本；接管和弱身份登记由所有引擎包共用的 JSON 入口负责。 */
const errors: Readonly<Record<string, string>> = {
  'json: unsupported value': 'Expected finite, acyclic JSON',
  'json: cyclic value': 'Expected finite, acyclic JSON',
  'json: plain objects required': 'Expected plain JSON object',
  'json: symbol key': 'JSON symbol key',
  'json: sparse or extended array': 'Sparse or extended array',
  'json: accessor or hidden property': 'JSON accessor or hidden property',
};
/** 接管并冻结纯 JSON 副本；Runtime 后续可安全复用这个值，不再读取外部原对象。 */
export function copyJson(input: unknown): JsonValue {
  try {
    return copyOwnedJson(input);
  } catch (error) {
    if (error instanceof Error && Object.hasOwn(errors, error.message))
      throw Error(errors[error.message]);
    throw error;
  }
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  return JSON.stringify(value)!;
}
export const digest = (value: unknown) => `sha256:${bytesToHex(sha256(canonical(value)))}`;
