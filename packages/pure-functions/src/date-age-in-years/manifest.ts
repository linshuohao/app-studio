import type { PureFunctionManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'date.ageInYears',
  version: '0.1.0',
  parameters: [
    { name: 'birthDate', schema: true },
    { name: 'asOfDate', schema: true },
  ],
  returns: { type: ['integer', 'null'], minimum: 0 },
} satisfies PureFunctionManifest;
