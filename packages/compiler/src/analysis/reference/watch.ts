import type { DataWatch } from '@form-engine/protocol/prepared';

/** 仅在同一词法环境内合并；scope 与观察方面都是身份的一部分，不合并不同字段。 */
export function mergeWatch(...groups: ReadonlyArray<ReadonlyArray<DataWatch>>): DataWatch[] {
  const items = new Map<string, DataWatch>();
  for (const group of groups)
    for (const reference of group) {
      const item: DataWatch = {
        source: 'data',
        path: reference.path,
        ...(reference.scope !== undefined ? { scope: reference.scope } : {}),
        ...(reference.aspect === 'structure' ? { aspect: 'structure' } : {}),
      };
      items.set(JSON.stringify([item.scope ?? null, item.path, item.aspect ?? 'value']), item);
    }
  return [...items].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, item]) => item);
}
