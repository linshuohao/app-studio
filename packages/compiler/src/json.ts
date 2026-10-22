import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import type { ContentDigest, JsonValue } from '@form-engine/protocol';
import { at } from './diagnostics.js';

export class JsonInputError extends Error {
  constructor(
    readonly code: string,
    readonly pointer: string,
    message: string,
  ) {
    super(message);
  }
}

/** Snapshot plain JSON without invoking accessors or toJSON on caller objects. */
export function snapshot(value: unknown): JsonValue {
  let count = 0;
  const active = new WeakSet<object>();
  const visit = (input: unknown, pointer: string, depth: number): JsonValue => {
    if (++count > 100_000 || depth > 128)
      throw new JsonInputError(
        'INPUT_BUDGET_EXCEEDED',
        pointer,
        'JSON input exceeds the node or nesting budget.',
      );
    if (input === null || typeof input === 'string' || typeof input === 'boolean') return input;
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input !== 'object' || !input)
      throw new JsonInputError('INPUT_NOT_JSON', pointer, 'Expected finite JSON values.');
    const prototype = Object.getPrototypeOf(input);
    if (prototype !== Object.prototype && prototype !== null && prototype !== Array.prototype)
      throw new JsonInputError(
        'INPUT_NOT_JSON',
        pointer,
        'Expected plain JSON objects and arrays.',
      );
    if (active.has(input))
      throw new JsonInputError('INPUT_NOT_JSON', pointer, 'Cyclic JSON input.');
    if (Object.getOwnPropertySymbols(input).length)
      throw new JsonInputError('INPUT_NOT_JSON', pointer, 'JSON cannot contain symbol properties.');
    active.add(input);
    const descriptors = Object.getOwnPropertyDescriptors(input);
    const entries: Array<[string, JsonValue]> = [];
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(input) && key === 'length') continue;
      if (!('value' in descriptor) || !descriptor.enumerable)
        throw new JsonInputError(
          'INPUT_NOT_JSON',
          at(pointer, key),
          'JSON data properties must be enumerable values, not accessors.',
        );
      entries.push([key, visit(descriptor.value, at(pointer, key), depth + 1)]);
    }
    active.delete(input);
    if (Array.isArray(input)) {
      if (entries.length !== input.length || entries.some(([key], i) => key !== String(i)))
        throw new JsonInputError(
          'INPUT_NOT_JSON',
          pointer,
          'Sparse arrays and extra array properties are not JSON.',
        );
      return entries.map(([, item]) => item);
    }
    return Object.fromEntries(entries);
  };
  return visit(value, '', 0);
}

/** Exact JSON text with lexicographically ordered object keys, preserving arrays. */
export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`)
    .join(',')}}`;
}
export function contentDigest(value: JsonValue): ContentDigest {
  return `sha256:${bytesToHex(sha256(canonicalJson(value)))}`;
}
