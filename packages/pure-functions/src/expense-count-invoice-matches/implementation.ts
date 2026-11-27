import type { ArtifactIdentity, JsonValue } from '@form-engine/protocol';
import type { FunctionBinding } from '../types.js';
import { manifest } from './manifest.js';

export function invoke(args: readonly JsonValue[]): JsonValue {
  const [rows, invoice] = args;
  const normalize = (value: JsonValue | undefined) =>
    typeof value === 'string' ? value.replace(/\s+/gu, '').toUpperCase() : '';
  const key = normalize(invoice);
  if (!Array.isArray(rows) || !key) return 0;
  return rows.filter(
    (row) =>
      row && typeof row === 'object' && !Array.isArray(row) && normalize(row.invoiceId) === key,
  ).length;
}

export function createExpenseCountInvoiceMatches(artifact: ArtifactIdentity): FunctionBinding {
  return { manifest, artifact, invoke };
}
