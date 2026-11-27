import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';

export function invoke(args: readonly JsonValue[]): JsonValue {
  const [rows, leftKey, rightKey] = args;
  if (
    args.length !== 3 ||
    typeof leftKey !== 'string' ||
    !leftKey ||
    typeof rightKey !== 'string' ||
    !rightKey
  ) {
    throw new Error('array.sumProducts expects rows and two non-empty property names');
  }
  if (!Array.isArray(rows)) return null;
  let total = 0;
  for (const row of rows) {
    if (
      row === null ||
      typeof row !== 'object' ||
      Array.isArray(row) ||
      !Object.hasOwn(row, leftKey) ||
      !Object.hasOwn(row, rightKey)
    )
      return null;
    const left = row[leftKey];
    const right = row[rightKey];
    if (
      typeof left !== 'number' ||
      !Number.isSafeInteger(left) ||
      left < 0 ||
      typeof right !== 'number' ||
      !Number.isSafeInteger(right) ||
      right < 0
    )
      return null;
    total += left * right;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

export function createArraySumProducts(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
