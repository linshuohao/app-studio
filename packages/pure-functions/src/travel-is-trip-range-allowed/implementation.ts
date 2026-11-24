import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';
import { arity, positiveLimit } from '../_internal/policy.js';
import { inclusiveDays } from '../_internal/date.js';
export function invoke(args: readonly JsonValue[]): JsonValue {
  arity(args, 3);
  const limit = positiveLimit(args[2]),
    days = inclusiveDays(args[0], args[1]);
  return days !== null && days <= limit;
}
export function createTravelIsTripRangeAllowed(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
