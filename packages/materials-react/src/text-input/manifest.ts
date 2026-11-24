import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'text-input',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      placeholder: {
        type: 'string',
      },
      disabled: {
        type: 'boolean',
      },
      readOnly: {
        type: 'boolean',
      },
      maxLength: {
        type: 'integer',
        minimum: 0,
      },
      inputMode: {
        type: 'string',
        enum: ['text', 'tel'],
      },
    },
    additionalProperties: false,
  },
  bindings: {
    value: {
      schema: {
        type: ['string', 'null'],
      },
    },
  },
} satisfies MaterialManifest;
