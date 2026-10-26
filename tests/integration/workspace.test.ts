import { describe, expect, it } from 'vitest';
import { checkManifest } from '../../tools/engineering/check-boundaries.mjs';
describe('workspace dependency policy', () => {
  it('rejects a reverse application dependency and a framework in core', () => {
    expect(() =>
      checkManifest('runtime', { dependencies: { '@form-engine/playground': 'workspace:*' } }),
    ).toThrow();
    expect(() => checkManifest('compiler', { dependencies: { react: '*' } })).toThrow();
    expect(() =>
      checkManifest('compiler', { dependencies: { '@form-engine/protocol': 'workspace:*' } }),
    ).not.toThrow();
  });
});
