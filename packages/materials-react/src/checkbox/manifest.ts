import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'checkbox',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
      },
      disabled: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
    required: ['label'],
  },
  bindings: {
    value: {
      schema: {
        type: 'boolean',
      },
    },
  },
} satisfies MaterialManifest;
