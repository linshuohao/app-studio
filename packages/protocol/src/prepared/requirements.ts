import type { ArtifactIdentity, ContentDigest } from '../common.js';
export interface LockedCapability {
  id: string;
  version: string;
  manifestDigest: ContentDigest;
  artifact: ArtifactIdentity;
}
/** Includes core.* entries or their immutable function-set artifact. */
export interface CapabilityLock {
  materials: Record<string, LockedCapability>;
  pureFunctions: Record<string, LockedCapability>;
}
export interface HostValidatorRequirement {
  name: string;
  constraintIds: string[];
  contractVersion?: string;
}
export interface HostEventRequirement {
  name: string;
  optional: boolean;
  contractVersion?: string;
}
export interface HostServiceRequirement {
  name: string;
  contractVersion: string;
  optional: boolean;
}
export interface HostRequirements {
  validators: HostValidatorRequirement[];
  events: HostEventRequirement[];
  services: HostServiceRequirement[];
}
