import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';
import { arity, readRatePolicy, personPremium } from '../_internal/policy.js';
export function invoke(args: readonly JsonValue[]): JsonValue {
  arity(args, 4);
  const policy = readRatePolicy(args[3]);
  return personPremium(args[0], args[1], args[2], policy);
}
export function createTravelPersonPremium(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
