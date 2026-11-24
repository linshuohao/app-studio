import type { MetadataValue } from './observation-protocol.js';

/** 行身份与内容分离；位置行使用稳定成员锚点，绝不使用当前数组下标作为身份。 */
export function metadataRowKey(row: MetadataValue, index = 0): string {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return `value:${index}`;
  const value = row as Readonly<Record<string, MetadataValue>>;
  const kind = String(value.record);
  if (kind === 'diagnostic') return JSON.stringify([kind, index, row]);
  const identity = value.entityId ?? value.id ?? value.workId ?? value.callId ?? value.nodeId;
  if (identity !== undefined) return JSON.stringify([kind, identity]);
  return `${kind}:${index}`;
}
export function metadataDifference(
  before: readonly MetadataValue[],
  after: readonly MetadataValue[],
) {
  const previous = new Map(before.map((row, index) => [metadataRowKey(row, index), row]));
  const upserts: Array<{ key: string; row: MetadataValue }> = [];
  const order: string[] = [];
  const seen = new Set<string>();
  after.forEach((row, index) => {
    const key = metadataRowKey(row, index);
    if (seen.has(key)) throw Error('duplicate metadata identity');
    order.push(key);
    seen.add(key);
    if (JSON.stringify(previous.get(key)) !== JSON.stringify(row)) upserts.push({ key, row });
    previous.delete(key);
  });
  return { upserts, removed: [...previous.keys()], order };
}
