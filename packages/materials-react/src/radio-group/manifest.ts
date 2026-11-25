import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'radio-group',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      options: {
        type: 'array',
        items: {
          type: 'object',
          required: ['id', 'label'],
          properties: { id: { type: 'string' }, label: { type: 'string' } },
          additionalProperties: false,
        },
      },
      disabled: { type: 'boolean' },
    },
    required: ['options'],
    additionalProperties: false,
  },
  bindings: { value: { schema: { type: ['string', 'null'] } } },
} satisfies MaterialManifest;
