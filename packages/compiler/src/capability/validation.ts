import type { PureFunctionManifest } from '@form-engine/protocol/capability';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { snapshot, JsonInputError } from '../common/json.js';
import { structure, structuralErrors } from '../validation/structure.js';
import type { ContractValidationResult } from '../types.js';

/** Standalone declaration checks; never imports or invokes an implementation. */
function validate(value: unknown, kind: 'material' | 'pureFunction'): ContractValidationResult {
  const diagnostics = new Diagnostics();
  try {
    const json = snapshot(value);
    for (const error of structuralErrors(structure[kind], json))
      diagnostics.error(
        'MANIFEST_INVALID',
        error.instancePath,
        `${error.keyword}: ${error.message}`,
      );
    if (!diagnostics.failed && kind === 'pureFunction') {
      const manifest = json as unknown as PureFunctionManifest;
      let optionalSeen = false;
      manifest.parameters.forEach((parameter, index) => {
        if (!parameter.optional && optionalSeen)
          diagnostics.error(
            'FUNCTION_PARAMETER_ORDER',
            at('/parameters', index),
            'Required parameters cannot follow optional parameters.',
          );
        optionalSeen ||= Boolean(parameter.optional);
      });
    }
  } catch (error) {
    if (!(error instanceof JsonInputError)) throw error;
    diagnostics.error(error.code, error.pointer, error.message);
  }
  return { valid: !diagnostics.failed, diagnostics: diagnostics.list() };
}
export const validateMaterialManifest = (manifest: unknown): ContractValidationResult =>
  validate(manifest, 'material');
export const validatePureFunctionManifest = (manifest: unknown): ContractValidationResult =>
  validate(manifest, 'pureFunction');
