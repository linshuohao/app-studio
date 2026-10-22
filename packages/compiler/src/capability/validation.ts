import type { PureFunctionManifest } from '@form-engine/protocol/capability';
import { Diagnostics } from '../diagnostics/collector.js';
import { at } from '../common/pointer.js';
import { snapshot, JsonInputError } from '../common/json.js';
import { structure, structuralErrors } from '../validation/structure.js';
import type { ContractValidationResult } from '../types.js';

/** 共享 Manifest 自检：结构 / 嵌入 Schema 语法与固定参数顺序；不导入或执行实现。 */
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
/** 单物料声明可独立自检；外部 Schema 引用的资源闭包仍由实际使用点检查。 */
export const validateMaterialManifest = (manifest: unknown): ContractValidationResult =>
  validate(manifest, 'material');
/** 仅检查函数声明，不代表已经实现表单表达式编译或证明函数行为 / 纯净性。 */
export const validatePureFunctionManifest = (manifest: unknown): ContractValidationResult =>
  validate(manifest, 'pureFunction');
