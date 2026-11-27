import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';

export function invoke(args: readonly JsonValue[]): JsonValue {
  const [claim, nights] = args;
  if (
    typeof claim !== 'number' ||
    !Number.isInteger(claim) ||
    claim < 1 ||
    claim > 5_000_000 ||
    typeof nights !== 'number' ||
    !Number.isInteger(nights) ||
    nights < 1 ||
    nights > 30
  )
    return 'invalid';
  return claim > nights * 45_000 ? 'over' : 'within';
}

export function createExpenseHotelStandardStatus(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
