import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'condition',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      visible: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
    required: ['visible'],
  },
  slots: ['default'],
} satisfies MaterialManifest;
