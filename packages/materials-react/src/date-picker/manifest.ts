import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'date-picker',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      placeholder: { type: 'string' },
      disabled: { type: 'boolean' },
      readOnly: { type: 'boolean' },
      min: { type: 'string', format: 'date' },
      max: { type: 'string', format: 'date' },
    },
    additionalProperties: false,
  },
  bindings: { value: { schema: { type: ['string', 'null'] } } },
} satisfies MaterialManifest;
