import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'field',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      label: {
        type: 'string',
      },
      help: {
        type: 'string',
      },
      requiredMark: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
    required: ['label'],
  },
  bindings: {
    value: {
      schema: true,
    },
  },
  slots: ['default'],
} satisfies MaterialManifest;
