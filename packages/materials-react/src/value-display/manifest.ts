import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'value-display',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      value: true,
      format: {
        type: 'string',
        enum: ['text', 'integer', 'moneyMinor'],
      },
      emptyText: {
        type: 'string',
      },
    },
    additionalProperties: false,
    required: ['value'],
  },
} satisfies MaterialManifest;
