import type { JsonSchema, JsonValue } from '@form-engine/protocol';

/** 只描述已知 JSON 值，绝不把对象内的 ref / op 等业务键当表达式。 */
export function literalSchema(value: JsonValue): JsonSchema {
  if (value === null) return { type: 'null', const: null };
  if (Array.isArray(value))
    return {
      type: 'array',
      const: value,
      items: value.length ? { anyOf: value.map(literalSchema) } : false,
    };
  if (typeof value === 'object')
    return {
      type: 'object',
      const: value,
      properties: Object.fromEntries(
        Object.entries(value).map(([key, child]) => [key, literalSchema(child)]),
      ),
      required: Object.keys(value),
      additionalProperties: false,
    };
  return {
    type: typeof value === 'number' && Number.isInteger(value) ? 'integer' : typeof value,
    const: value,
  };
}
