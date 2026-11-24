import type { PureFunctionManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'travel.requiresGuardian',
  version: '0.1.0',
  parameters: [
    {
      name: 'age',
      schema: true,
    },
    {
      name: 'agePolicy',
      schema: {
        type: 'object',
        required: ['minAge', 'maxAge', 'adultAge'],
        properties: {
          minAge: {
            type: 'integer',
            minimum: 0,
            maximum: 9007199254740991,
          },
          maxAge: {
            type: 'integer',
            minimum: 0,
            maximum: 9007199254740991,
          },
          adultAge: {
            type: 'integer',
            minimum: 0,
            maximum: 9007199254740991,
          },
        },
        additionalProperties: false,
      },
    },
  ],
  returns: {
    type: 'boolean',
  },
} satisfies PureFunctionManifest;
