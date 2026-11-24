import type { MaterialManifest } from '@form-engine/protocol/capability';

export const manifest = {
  id: '__ID__',
  version: '0.1.0',
  propsSchema: { type: 'object', additionalProperties: false },
  bindings: { value: { schema: true } },
} satisfies MaterialManifest;
