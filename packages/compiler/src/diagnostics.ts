import type { Diagnostic } from './types.js';

export const escapePointer = (key: string) => key.replaceAll('~', '~0').replaceAll('/', '~1');
export const at = (pointer: string, key: string | number) =>
  `${pointer}/${escapePointer(String(key))}`;
export const own = (value: object, key: PropertyKey) => Object.hasOwn(value, key);
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export class Diagnostics {
  private readonly entries: Diagnostic[] = [];
  error(
    code: string,
    sourcePointer: string,
    message: string,
    relatedLocations?: Diagnostic['relatedLocations'],
  ): void {
    if (this.entries.length >= 200) return;
    this.entries.push({
      code,
      severity: 'error',
      message,
      sourcePointer,
      ...(relatedLocations ? { relatedLocations } : {}),
    });
  }
  get failed(): boolean {
    return this.entries.some((entry) => entry.severity === 'error');
  }
  list(): Diagnostic[] {
    const unique = new Map(this.entries.map((entry) => [JSON.stringify(entry), entry]));
    const key = (entry: Diagnostic) =>
      JSON.stringify([
        entry.sourcePointer,
        entry.code,
        entry.message,
        entry.relatedLocations ?? [],
      ]);
    return [...unique.values()].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
  }
}
