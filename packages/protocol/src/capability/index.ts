import type { ArtifactIdentity, JsonSchema } from '../common.js';
export type * from '../common.js';
/** A static model compatibility contract, never a Runtime write permission/gate. */
export interface BindingContract {
  schema: JsonSchema;
}
/** Omitted schema means a notification with no configuration-readable payload. */
export interface EventContract {
  payloadSchema?: JsonSchema;
}
export interface HostServiceRequirement {
  contractVersion: string;
  optional?: boolean;
}
export interface MaterialManifest {
  id: string;
  version: string;
  propsSchema?: JsonSchema;
  bindings?: Record<string, BindingContract>;
  /** Accepted slot names; no cardinality policy. Default slot is named 'default'.
   * @uniqueItems true
   */
  slots?: string[];
  events?: Record<string, EventContract>;
  services?: Record<string, HostServiceRequirement>;
}
export interface FunctionParameter {
  name: string;
  schema: JsonSchema;
  optional?: boolean;
}
export interface PureFunctionManifest {
  id: string;
  version: string;
  parameters: FunctionParameter[];
  restParameter?: FunctionParameter;
  returns: JsonSchema;
}
/** Snapshot/Scope invocation contract version, not a named argument mapping. */
export interface HostValidatorContract {
  contractVersion: string;
}
export interface HostEventContract extends EventContract {
  optional?: boolean;
}
/** Method signatures live in the actual service's own SDK. */
export interface HostServiceContract {
  contractVersion: string;
}
export interface HostContract {
  validators?: Record<string, HostValidatorContract>;
  events?: Record<string, HostEventContract>;
  services?: Record<string, HostServiceContract>;
}
export interface MaterialCatalogEntry {
  manifest: MaterialManifest;
  artifact: ArtifactIdentity;
}
export interface PureFunctionCatalogEntry {
  manifest: PureFunctionManifest;
  artifact: ArtifactIdentity;
}
/** Deterministically resolved input, not a registry/search API or mutable 'latest' catalog. */
export interface CapabilityCatalogSnapshot {
  id: string;
  materials: Record<string, MaterialCatalogEntry>;
  pureFunctions: Record<string, PureFunctionCatalogEntry>;
  host?: HostContract;
}
