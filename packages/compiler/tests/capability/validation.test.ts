import { describe, expect, it } from 'vitest';
import * as compiler from '../../src/index.js';
import { input } from '../fixtures.js';

function errors(result: ReturnType<typeof compiler.compile>) {
  expect(result.success).toBe(false);
  expect(result).not.toHaveProperty('prepared');
  return result.diagnostics;
}

describe('standalone capability contract checks', () => {
  it('checks a Manifest without needing a definition, catalog or implementation', () => {
    expect(compiler.validateMaterialManifest(input().catalog.materials.input!.manifest)).toEqual({
      valid: true,
      diagnostics: [],
    });
    expect(
      compiler.validatePureFunctionManifest({
        id: 'business.f',
        version: 'v1',
        parameters: [{ name: 'n', schema: { type: 'number' } }],
        returns: { type: 'number' },
      }).valid,
    ).toBe(true);
  });
  it('distinguishes invalid structure from invalid optional parameter ordering', () => {
    expect(
      compiler.validateMaterialManifest({
        id: 'bad',
        version: 'v1',
        requests: { query: { payloadSchema: true } },
      }).valid,
    ).toBe(false);
    expect(
      compiler.validatePureFunctionManifest({
        id: 'f',
        version: 'v1',
        parameters: [
          { name: 'x', schema: true, optional: true },
          { name: 'y', schema: true },
        ],
        returns: true,
      }).diagnostics,
    ).toContainEqual(
      expect.objectContaining({ code: 'FUNCTION_PARAMETER_ORDER', sourcePointer: '/parameters/1' }),
    );
  });
  it('reports malformed used contracts at catalog locations and avoids cascades', () => {
    const source = input();
    source.catalog.materials.input!.manifest.id = 'other';
    const diagnostics = errors(compiler.compile(source));
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        code: 'CAPABILITY_ID_MISMATCH',
        relatedLocations: expect.arrayContaining([
          expect.objectContaining({
            sourceId: 'catalog-fixed',
            pointer: '/materials/input/manifest/id',
          }),
        ]),
      }),
    );
    expect(diagnostics.some((d) => d.code === 'PROPS_INVALID')).toBe(false);
  });
});
