import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'array-editor',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      initial: { type: 'object' },
      columns: { type: 'integer', enum: [1, 2] },
      defaultExpanded: { type: 'boolean' },
      drawerTitle: { type: 'string' },
      confirmTitle: { type: 'string' },
      minItems: { type: 'integer', minimum: 0 },
    },
    required: ['title', 'initial'],
    additionalProperties: false,
  },
  bindings: { value: { schema: { type: 'array', items: { type: 'object' } } } },
} satisfies MaterialManifest;
