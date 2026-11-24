import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';

import { ageInYears } from '../_internal/date.js';
import { arity } from '../_internal/policy.js';

export function invoke(args: readonly JsonValue[]): JsonValue {
  arity(args, 2);
  return ageInYears(args[0], args[1]);
}

export function createDateAgeInYears(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
