import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'select',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'label'],
          properties: {
            id: {
              type: 'string',
            },
            label: {
              type: 'string',
            },
          },
          additionalProperties: false,
        },
      },
      placeholder: {
        type: 'string',
      },
      disabled: {
        type: 'boolean',
      },
      clearable: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
    required: ['options'],
  },
  bindings: {
    value: {
      schema: {
        type: ['string', 'null'],
      },
    },
  },
} satisfies MaterialManifest;
