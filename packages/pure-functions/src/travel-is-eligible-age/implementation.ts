import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';
import { arity, readAgePolicy, eligible } from '../_internal/policy.js';
export function invoke(args: readonly JsonValue[]): JsonValue {
  arity(args, 2);
  const policy = readAgePolicy(args[1]);
  return eligible(args[0], policy);
}
export function createTravelIsEligibleAge(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
