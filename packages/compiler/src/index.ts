export { compile } from './pipeline/compile.js';
export { checkDataSchema } from './pipeline/data-schema.js';
export type { DataSchemaCase } from './pipeline/data-schema.js';
export { validateMaterialManifest, validatePureFunctionManifest } from './capability/validation.js';
export { PREPARED_FORMAT_VERSION } from './types.js';
export type { CompileInput, CompileResult, Diagnostic, ContractValidationResult } from './types.js';

export type { CapabilityReference } from './capability/catalog.js';
