import type { ReactNode } from 'react';
import { getEngineeringLabel } from '@form-engine/runtime/engineering';
export function EngineeringPanel({ children }: { children: ReactNode }) {
  return <section aria-label={getEngineeringLabel()}>{children}</section>;
}
