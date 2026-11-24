import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'insured-summary',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      premiumMinor: {
        type: ['integer', 'null'],
        minimum: 0,
        maximum: 9007199254740991,
      },
      emptyName: {
        type: 'string',
      },
    },
    additionalProperties: false,
    required: ['premiumMinor'],
  },
  bindings: {
    insured: {
      schema: {
        type: 'object',
      },
    },
  },
} satisfies MaterialManifest;
