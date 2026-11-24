import type { PureFunctionManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'date.inclusiveDays',
  version: '0.1.0',
  parameters: [
    {
      name: 'start',
      schema: true,
    },
    {
      name: 'end',
      schema: true,
    },
  ],
  returns: {
    type: ['integer', 'null'],
    minimum: 1,
  },
} satisfies PureFunctionManifest;
