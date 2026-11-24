import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'number-input',
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
      inputMode: {
        type: 'string',
        enum: ['numeric', 'decimal'],
      },
    },
    additionalProperties: false,
  },
  bindings: {
    value: {
      schema: {
        type: ['number', 'null'],
      },
    },
  },
} satisfies MaterialManifest;
