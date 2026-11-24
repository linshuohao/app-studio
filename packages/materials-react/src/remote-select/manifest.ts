import type { MaterialManifest } from '@form-engine/protocol/capability';
export const manifest: MaterialManifest = {
  id: 'remote-select',
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
      clearable: {
        type: 'boolean',
      },
      filterKey: {
        type: ['string', 'null'],
      },
    },
    additionalProperties: false,
  },
  bindings: {
    value: {
      schema: {
        anyOf: [
          {
            type: 'object',
            required: ['id', 'label'],
            properties: {
              id: {
                type: 'string',
              },
              label: {
                type: 'string',
              },
            },
            additionalProperties: false,
          },
          {
            type: 'null',
          },
        ],
      },
    },
  },
  requests: {
    search: {
      payloadSchema: {
        type: 'object',
        required: ['query', 'filterKey'],
        properties: {
          query: {
            type: 'string',
          },
          filterKey: {
            type: ['string', 'null'],
          },
        },
        additionalProperties: false,
      },
      resultSchema: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['id', 'label'],
              properties: {
                id: {
                  type: 'string',
                },
                label: {
                  type: 'string',
                },
              },
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      concurrency: 'latest',
    },
  },
};
