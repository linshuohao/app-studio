import type { JsonValue } from '@form-engine/protocol';
export interface DisplayValueProps {
  value: JsonValue;
  format?: 'text' | 'integer' | 'moneyMinor';
  emptyText?: string;
}
export function formatValue({
  value,
  format = 'text',
  emptyText = '—',
}: DisplayValueProps): string {
  if (value === null || value === '') return emptyText;
  if (format === 'text')
    return ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : emptyText;
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) return emptyText;
  if (format === 'integer') return String(value);
  const negative = value < 0,
    digits = String(Math.abs(value)).padStart(3, '0');
  return `${negative ? '-' : ''}¥${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
