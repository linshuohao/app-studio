import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'textarea',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      placeholder: { type: 'string' },
      disabled: { type: 'boolean' },
      readOnly: { type: 'boolean' },
      rows: { type: 'integer', minimum: 1 },
      maxLength: { type: 'integer', minimum: 0 },
    },
    additionalProperties: false,
  },
  bindings: { value: { schema: { type: ['string', 'null'] } } },
} satisfies MaterialManifest;
