export const own = (value: object, key: PropertyKey) => Object.hasOwn(value, key);
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
