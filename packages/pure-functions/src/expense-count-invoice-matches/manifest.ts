import type { PureFunctionManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'expense.countInvoiceMatches',
  version: '0.1.0',
  parameters: [
    { name: 'expenses', schema: true },
    { name: 'invoiceId', schema: true },
  ],
  returns: { type: 'integer', minimum: 0 },
} satisfies PureFunctionManifest;
