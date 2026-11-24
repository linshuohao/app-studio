import type { MaterialAdapter } from '@form-engine/renderer-react';
export type ValueAdapter = MaterialAdapter<
  object,
  'value',
  Record<string, never>,
  Record<string, never>
>;
export type ValueRead = ValueAdapter['values']['value'];
export type ValueValidation = ValueAdapter['validation']['value'];
export interface TextControlProps {
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
}
