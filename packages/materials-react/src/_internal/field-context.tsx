import { createContext, useContext, useId, useLayoutEffect } from 'react';
import type { ValueValidation } from './types.js';
export interface FieldConnection {
  labelId: string;
  descriptionId: string;
  register: (id: string) => () => void;
}
export const FieldContext = createContext<FieldConnection | null>(null);
/** DOM association only; values and validation remain in the Material Adapter. */
export function useFieldControl(
  validation: ValueValidation,
  fallbackLabel?: string,
  standaloneLabel = '输入值',
) {
  const field = useContext(FieldContext);
  const id = useId();
  useLayoutEffect(() => field?.register(id), [field, id]);
  return {
    id,
    'aria-labelledby': fallbackLabel ? undefined : field?.labelId,
    'aria-label': fallbackLabel ?? (field ? undefined : standaloneLabel),
    'aria-describedby': field?.descriptionId,
    'aria-invalid': validation.status === 'invalid' || validation.issues.length > 0,
  } as const;
}
