import type { PureFunctionManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'expense.hotelStandardStatus',
  version: '0.1.0',
  parameters: [
    { name: 'claimMinor', schema: true },
    { name: 'nights', schema: true },
  ],
  returns: { type: 'string', enum: ['within', 'over', 'invalid'] },
} satisfies PureFunctionManifest;
