import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';

export function invoke(_args: readonly JsonValue[]): JsonValue {
  throw new Error('Asset __ID__ not implemented');
}

export function create__TITLE__(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
