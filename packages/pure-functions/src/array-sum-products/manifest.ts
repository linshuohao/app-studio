import type { PureFunctionManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'array.sumProducts',
  version: '0.1.0',
  parameters: [
    { name: 'rows', schema: true },
    { name: 'leftKey', schema: { type: 'string', minLength: 1 } },
    { name: 'rightKey', schema: { type: 'string', minLength: 1 } },
  ],
  returns: { type: ['integer', 'null'], minimum: 0, maximum: 9007199254740991 },
} satisfies PureFunctionManifest;
