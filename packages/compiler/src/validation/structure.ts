import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv';
import definition from '@form-engine/protocol/schemas/authoring-form-definition.schema.json' with { type: 'json' };
import catalog from '@form-engine/protocol/schemas/capability-catalog-snapshot.schema.json' with { type: 'json' };
import prepared from '@form-engine/protocol/schemas/prepared-form.schema.json' with { type: 'json' };
import material from '@form-engine/protocol/schemas/material-manifest.schema.json' with { type: 'json' };
import pureFunction from '@form-engine/protocol/schemas/pure-function-manifest.schema.json' with { type: 'json' };

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

const ajv = createAjv();
export const structure = {
  definition: ajv.compile(definition),
  catalog: ajv.compile(catalog),
  prepared: ajv.compile(prepared),
  material: ajv.compile(material),
  pureFunction: ajv.compile(pureFunction),
};
export function structuralErrors(check: ValidateFunction, value: unknown): ErrorObject[] {
  return check(value) ? [] : [...(check.errors ?? [])];
}
