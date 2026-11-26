import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';

export function invoke(args: readonly JsonValue[]): JsonValue {
  const [rows, key, value] = args;
  if (args.length !== 3 || typeof key !== 'string' || !key.length) {
    throw new Error(
      'array.countNormalizedText expects rows, a non-empty property name and a value',
    );
  }
  if (!Array.isArray(rows)) return null;
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) return 0;
  let count = 0;
  for (const row of rows) {
    if (row === null || typeof row !== 'object' || Array.isArray(row) || !Object.hasOwn(row, key)) {
      continue;
    }
    const entry = row[key];
    if (typeof entry === 'string' && entry.trim().toLowerCase() === normalized) count++;
  }
  return count;
}

export function createArrayCountNormalizedText(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
