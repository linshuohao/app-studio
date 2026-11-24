import type { PureFunctionManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: 'text.isNonBlank',
  version: '0.1.0',
  parameters: [{ name: 'value', schema: true }],
  returns: { type: 'boolean' },
} satisfies PureFunctionManifest;
