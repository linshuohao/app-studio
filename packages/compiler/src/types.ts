import type { JsonSchema } from '@form-engine/protocol';
import type { CompilerInputDefinition } from '@form-engine/protocol/definition';
import type { CapabilityCatalogSnapshot } from '@form-engine/protocol/capability';
import type { PreparedForm } from '@form-engine/protocol/prepared';

export interface CompileInput {
  definition: CompilerInputDefinition;
  catalog: CapabilityCatalogSnapshot;
  target?: { profile?: string; platform?: string; preparedFormatVersion?: string };
  schemaResources?: Record<string, JsonSchema>;
}
export interface Diagnostic {
  code: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  sourcePointer: string;
  relatedLocations?: Array<{ sourceId: string; pointer: string; message?: string }>;
}
export type CompileResult =
  | { success: true; prepared: PreparedForm; diagnostics: Diagnostic[] }
  | { success: false; diagnostics: Diagnostic[] };
export interface ContractValidationResult {
  valid: boolean;
  diagnostics: Diagnostic[];
}

/** Private, prerelease format identity; Runtime must explicitly support it. */
export const PREPARED_FORMAT_VERSION = 'form-engine.prepared/1';
