import { engineeringMarker } from '@form-engine/protocol/engineering';
import { engineeringLabel } from '@form-engine/pure-functions/engineering';
// Dependency and packaging check only; this is not a form Runtime.
export function getEngineeringLabel(): string {
  return engineeringLabel(engineeringMarker);
}
