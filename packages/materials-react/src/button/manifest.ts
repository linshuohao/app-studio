import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'button',
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
      variant: {
        type: 'string',
        enum: ['primary', 'secondary', 'danger'],
      },
    },
    additionalProperties: false,
    required: ['label'],
  },
  events: {
    activate: {},
  },
} satisfies MaterialManifest;
