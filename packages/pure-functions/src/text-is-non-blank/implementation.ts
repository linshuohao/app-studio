import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';

/** ECMAScript trim whitespace; no coercion or normalization of the input. */
export function invoke(args: readonly JsonValue[]): JsonValue {
  if (args.length !== 1) throw new Error('text.isNonBlank expects exactly one argument');
  return typeof args[0] === 'string' && args[0].trim().length > 0;
}

export function createTextIsNonBlank(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
