import { describe, expect, it } from 'vitest';
import { engineeringMarker } from '@form-engine/protocol/engineering';
import { inspectEngineeringMarker } from '@form-engine/compiler/engineering';
import { getEngineeringLabel } from '@form-engine/runtime/engineering';
import { checkManifest } from '../../tools/engineering/check-boundaries.mjs';
describe('engineering workspace (not production engine conformance)', () => {
  it('consumes source public subpath exports across the core packages', () => {
    expect(inspectEngineeringMarker()).toBe(engineeringMarker);
    expect(getEngineeringLabel()).toBe(`工程验证：${engineeringMarker}`);
  });
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
