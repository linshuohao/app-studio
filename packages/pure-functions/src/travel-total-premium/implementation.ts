import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';
import {
  arity,
  readRatePolicy,
  personPremium,
  checkedAmount,
  eligible,
} from '../_internal/policy.js';
export function invoke(args: readonly JsonValue[]): JsonValue {
  arity(args, 4);
  const policy = readRatePolicy(args[3]),
    insureds = args[0];
  if (!Array.isArray(insureds) || insureds.length < 1 || insureds.length > policy.maxInsureds)
    return null;
  const ages: number[] = [];
  for (const person of insureds) {
    if (
      !person ||
      typeof person !== 'object' ||
      Array.isArray(person) ||
      !eligible(person.age, policy.agePolicy)
    )
      return null;
    ages.push(person.age);
  }
  let total = 0;
  for (const age of ages) {
    const amount = personPremium(age, args[1], args[2], policy);
    if (amount === null) return null;
    total = checkedAmount(total + amount);
  }
  return total;
}
export function createTravelTotalPremium(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
