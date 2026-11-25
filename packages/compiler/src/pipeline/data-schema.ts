import { compileDataSchema } from '@form-engine/protocol/internal/schema';
import type { CompileInput, ContractValidationResult } from '../types.js';
import { Diagnostics } from '../diagnostics/collector.js';
import { SchemaModel } from '../analysis/schema/model.js';
import { record } from '../common/object.js';

type DataSchema = CompileInput['definition']['data']['schema'];
type Resources = NonNullable<CompileInput['schemaResources']>;
export type DataSchemaCase = { name: string; data: unknown; valid: boolean };

export function executableDataSchema(
  schema: DataSchema,
  resources: Resources,
  diagnostics: Diagnostics,
) {
  try {
    return compileDataSchema(schema, resources);
  } catch (error) {
    diagnostics.error(
      'DATA_SCHEMA_INVALID',
      '/data/schema',
      error instanceof Error ? error.message : String(error),
    );
    return undefined;
  }
}

/** Inspect a data contract independently of views and rules. Resources come from the trusted target. */
export function checkDataSchema(
  schema: unknown,
  resources: Resources,
  cases: readonly DataSchemaCase[],
): ContractValidationResult {
  const diagnostics = new Diagnostics();
  if (typeof schema !== 'boolean' && !record(schema)) {
    diagnostics.error('DATA_SCHEMA_INVALID', '/data/schema', 'Expected a JSON Schema.');
    return { valid: false, diagnostics: diagnostics.list() };
  }
  const dataSchema = schema as DataSchema;
  const model = new SchemaModel(dataSchema, resources, diagnostics);
  const validate = diagnostics.failed
    ? undefined
    : executableDataSchema(dataSchema, model.resources(), diagnostics);
  if (validate)
    for (const sample of cases)
      if (validate(sample.data) !== sample.valid)
        diagnostics.error(
          'DATA_SCHEMA_CASE_MISMATCH',
          '/data/schema',
          `Case ${sample.name}: expected ${sample.valid ? 'valid' : 'invalid'} data. ${JSON.stringify(validate.errors ?? [])}`,
        );
  return { valid: !diagnostics.failed, diagnostics: diagnostics.list() };
}
