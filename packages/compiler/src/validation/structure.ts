import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import definition from '@form-engine/protocol/schemas/authoring-form-definition.schema.json' with { type: 'json' };
import catalog from '@form-engine/protocol/schemas/capability-catalog-snapshot.schema.json' with { type: 'json' };
import material from '@form-engine/protocol/schemas/material-manifest.schema.json' with { type: 'json' };
import pureFunction from '@form-engine/protocol/schemas/pure-function-manifest.schema.json' with { type: 'json' };

/** 严格检查结构且不改写输入；format 没有注册实际校验器，当前不作格式断言。 */
export function createAjv() {
  return new Ajv2020({
    strict: true,
    allowUnionTypes: true,
    strictRequired: false,
    validateFormats: false,
    allErrors: true,
    ownProperties: true,
  });
}

// 协议 Schema 直接消费 protocol 包的生成物，不在 Compiler 维护另一份字段规范。
const ajv = createAjv();
export const structure = {
  definition: ajv.compile(definition),
  catalog: ajv.compile(catalog),
  material: ajv.compile(material),
  pureFunction: ajv.compile(pureFunction),
};
/** Ajv 会在下一次校验覆盖 errors；调用处拿到当前错误列表的副本。 */
export function structuralErrors(check: ValidateFunction, value: unknown): ErrorObject[] {
  return check(value) ? [] : [...(check.errors ?? [])];
}
