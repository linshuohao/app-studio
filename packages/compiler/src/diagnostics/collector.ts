import type { Diagnostic } from '../types.js';

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
