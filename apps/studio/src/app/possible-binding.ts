/** Conservative filter: refs and unconstrained schemas stay selectable for compiler verification. */
export function possibleBinding(expected: unknown, actual: unknown): boolean {
  const types = (schema: unknown): string[] => {
    if (!schema || typeof schema !== 'object') return [];
    if ('anyOf' in schema && Array.isArray(schema.anyOf)) return schema.anyOf.flatMap(types);
    if ('oneOf' in schema && Array.isArray(schema.oneOf)) return schema.oneOf.flatMap(types);
    if (!('type' in schema)) return [];
    return Array.isArray(schema.type)
      ? schema.type
      : typeof schema.type === 'string'
        ? [schema.type]
        : [];
  };
  const a = types(actual),
    b = types(expected);
  return (
    !a.length ||
    !b.length ||
    a.every((v) => b.includes(v) || (v === 'integer' && b.includes('number')))
  );
}
