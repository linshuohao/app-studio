import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest = {
  id: 'date-range',
  version: '0.1.0',
  propsSchema: {
    type: 'object',
    required: ['label'],
    properties: {
      label: {
        type: 'string',
      },
      startLabel: {
        type: 'string',
      },
      endLabel: {
        type: 'string',
      },
      startMin: { type: 'string', format: 'date' },
      startMax: { type: 'string', format: 'date' },
      disabled: {
        type: 'boolean',
      },
    },
    additionalProperties: false,
  },
  bindings: {
    start: {
      schema: {
        type: ['string', 'null'],
      },
    },
    end: {
      schema: {
        type: ['string', 'null'],
      },
    },
  },
} satisfies MaterialManifest;
