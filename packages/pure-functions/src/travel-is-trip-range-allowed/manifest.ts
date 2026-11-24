import type { PureFunctionManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'travel.isTripRangeAllowed',
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
    {
      name: 'maxDays',
      schema: {
        type: 'integer',
        minimum: 1,
        maximum: 9007199254740991,
      },
    },
  ],
  returns: {
    type: 'boolean',
  },
} satisfies PureFunctionManifest;
