import type { PureFunctionManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: '__ID__',
  version: '0.1.0',
  parameters: [{ name: 'value', schema: true }],
  returns: true,
} satisfies PureFunctionManifest;
