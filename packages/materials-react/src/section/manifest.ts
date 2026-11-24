import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'section',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
      },
      description: {
        type: 'string',
      },
      collapsible: {
        type: 'boolean',
      },
      defaultExpanded: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
  },
  slots: ['default', 'actions'],
} satisfies MaterialManifest;
