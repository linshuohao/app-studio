import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';
import { arity } from '../_internal/policy.js';
import { inclusiveDays } from '../_internal/date.js';
export function invoke(args: readonly JsonValue[]): JsonValue {
  arity(args, 2);
  return inclusiveDays(args[0], args[1]);
}
export function createDateInclusiveDays(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
