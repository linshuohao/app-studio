import type { CompileInput } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { own, record } from '../common/object.js';
import { JsonInputError, snapshot } from '../common/json.js';
import { createAjv, structuralErrors, structure } from '../validation/structure.js';

/** 接收 SDK 输入：复制纯 JSON、检查外层选项及协议结构；不解析业务引用。 */
export function receive(input: CompileInput, diagnostics: Diagnostics): CompileInput | undefined {
  try {
    // SDK 可选参数允许显式 undefined；协议内部仍严格要求 JSON，不能统一滤掉 undefined。
    const descriptors = Object.getOwnPropertyDescriptors(input);
    for (const key of ['target', 'schemaResources'])
      if (descriptors[key] && 'value' in descriptors[key] && descriptors[key].value === undefined)
        delete descriptors[key];
    const json = snapshot(Object.create(Object.getPrototypeOf(input), descriptors));
    if (
      !record(json) ||
      Object.keys(json).some(
        (key) => !['definition', 'catalog', 'target', 'schemaResources'].includes(key),
      ) ||
      !own(json, 'definition') ||
      !own(json, 'catalog')
    ) {
      diagnostics.error(
        'COMPILE_INPUT_INVALID',
        '',
        'Expected definition, catalog and optional target / schemaResources.',
      );
      return undefined;
    }
    if (
      json.target !== undefined &&
      (!record(json.target) ||
        Object.entries(json.target).some(
          ([key, value]) =>
            !['profile', 'platform', 'preparedFormatVersion'].includes(key) ||
            typeof value !== 'string',
        ))
    ) {
      diagnostics.error('COMPILE_INPUT_INVALID', '', 'Invalid compilation target.');
      return undefined;
    }
    if (json.schemaResources !== undefined) {
      if (!record(json.schemaResources)) {
        diagnostics.error(
          'COMPILE_INPUT_INVALID',
          '',
          'schemaResources must be a schema dictionary.',
        );
        return undefined;
      }
      const ajv = createAjv();
      for (const [name, schema] of Object.entries(json.schemaResources))
        if (!ajv.validateSchema(schema as object))
          diagnostics.error(
            'SCHEMA_RESOURCE_INVALID',
            '',
            `Invalid fixed schema resource ${name}.`,
            [{ sourceId: `schemaResources:${name}`, pointer: '' }],
          );
    }
    // 表单位置直接指向 Definition；Catalog 错误另外保留快照身份，避免混淆来源。
    for (const error of structuralErrors(structure.definition, json.definition))
      diagnostics.error(
        'DEFINITION_INVALID',
        error.instancePath,
        `${error.keyword}: ${error.message}`,
      );
    for (const error of structuralErrors(structure.catalog, json.catalog))
      diagnostics.error('CATALOG_INVALID', '', `${error.keyword}: ${error.message}`, [
        {
          sourceId:
            record(json.catalog) && typeof json.catalog.id === 'string'
              ? json.catalog.id
              : 'catalog',
          pointer: error.instancePath,
        },
      ]);
    return diagnostics.failed ? undefined : (json as unknown as CompileInput);
  } catch (error) {
    if (error instanceof JsonInputError)
      diagnostics.error(
        error.code,
        error.pointer.startsWith('/definition') ? error.pointer.slice('/definition'.length) : '',
        error.message,
      );
    else if (input === null || typeof input !== 'object')
      diagnostics.error('COMPILE_INPUT_INVALID', '', 'Expected a compilation input object.');
    else throw error;
    return undefined;
  }
}
