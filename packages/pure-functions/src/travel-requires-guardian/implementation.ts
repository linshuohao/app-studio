import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';
import { arity, readAgePolicy, eligible } from '../_internal/policy.js';
export function invoke(args: readonly JsonValue[]): JsonValue {
  arity(args, 2);
  const policy = readAgePolicy(args[1]),
    age = args[0];
  return eligible(age, policy) && age < policy.adultAge;
}
export function createTravelRequiresGuardian(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
