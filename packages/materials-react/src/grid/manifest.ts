import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'grid',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      columns: {
        type: 'integer',
        enum: [1, 2, 3],
      },
      gap: {
        type: 'string',
        enum: ['small', 'medium', 'large'],
      },
    },
    additionalProperties: false,
  },
  slots: ['default'],
} satisfies MaterialManifest;
