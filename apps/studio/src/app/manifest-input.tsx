'use client';
import Ajv2020 from 'ajv/dist/2020';
import { LiteralValueEditor, newLiteral, readLiteral, literalSource } from './literal-value-editor';
import { SchemaJsonValue } from './schema-json-value';
import { StudioSelect } from '../components/ui/select';
import type { Schema } from '../components/catalog/contract-reference';
const validator = new Ajv2020({ strict: false, allErrors: true, validateFormats: false });
export function validateLiteral(schema: Schema, value: unknown) {
  if (!validator.validate(schema, value))
    throw Error('属性不符合物料契约：' + validator.errorsText(validator.errors));
}
export function defaultLiteral(schema: Schema): string {
  if (typeof schema !== 'object') return 'null';
  if (schema.default !== undefined) return JSON.stringify(schema.default);
  const first = Array.isArray(schema.enum) ? schema.enum[0] : undefined;
  if (first !== undefined) return JSON.stringify(first);
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  return JSON.stringify(
    schema.default ??
      (
        {
          string: '',
          integer: schema.minimum ?? 0,
          number: schema.minimum ?? 0,
          boolean: false,
          array: [],
          object: {},
        } as Record<string, unknown>
      )[type ?? ''] ??
      null,
  );
}
export function ManifestInput({
  label,
  schema,
  value,
  set,
  showLabel = true,
}: {
  label: string;
  schema: Schema;
  value: string;
  set: (raw: string) => void;
  showLabel?: boolean;
}) {
  const s = typeof schema === 'object' ? schema : {},
    enums = Array.isArray(s.enum) ? s.enum : undefined;
  if (enums)
    return (
      <label>
        {showLabel && label}
        <StudioSelect aria-label={label} value={value} onValueChange={set}>
          {enums.map((v) => (
            <option key={JSON.stringify(v)} value={JSON.stringify(v)}>
              {String(v)}
            </option>
          ))}
        </StudioSelect>
      </label>
    );
  if (
    typeof s.type === 'string' &&
    ['boolean', 'string', 'number', 'integer', 'object', 'array', 'null'].includes(s.type)
  ) {
    const initial = newLiteral(s.type);
    let literal = initial;
    try {
      const parsed = readLiteral(value);
      if (parsed.kind === initial.kind) literal = parsed;
    } catch {
      if (initial.kind === 'number') literal = { ...initial, text: value };
    }
    return (
      <div>
        {showLabel && <span>{label}</span>}
        <LiteralValueEditor
          label={label}
          value={literal}
          numeric={{
            integer: s.type === 'integer',
            min: s.minimum as number,
            max: s.maximum as number,
          }}
          stringLimits={{ minLength: s.minLength as number, maxLength: s.maxLength as number }}
          onChange={(next) => set(next.kind === 'number' ? next.text : literalSource(next))}
        />
      </div>
    );
  }
  return (
    <div>
      {showLabel && <strong>{label}</strong>}
      <SchemaJsonValue label={label} text={value} onChange={set} />
    </div>
  );
}
