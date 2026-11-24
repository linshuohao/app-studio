import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'dialog-editor',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
      },
      triggerLabel: {
        type: 'string',
      },
      disabled: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
    required: ['title'],
  },
  slots: ['summary', 'content'],
} satisfies MaterialManifest;
