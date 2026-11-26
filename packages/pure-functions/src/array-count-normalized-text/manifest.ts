import type { PureFunctionManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'array.countNormalizedText',
  version: '0.1.0',
  parameters: [
    { name: 'rows', schema: true },
    { name: 'key', schema: { type: 'string', minLength: 1 } },
    { name: 'value', schema: true },
  ],
  returns: { type: ['integer', 'null'], minimum: 0 },
} satisfies PureFunctionManifest;
