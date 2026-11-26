import type { CompileInput } from '@form-engine/compiler';
import { expect, it } from 'vitest';
import { WebAssetCatalog } from '../../services/api/src/platform/web-asset-catalog';

const snapshot = (name: string, version: string, byte: string): CompileInput['catalog'] => ({
  id: name,
  materials: {
    text: {
      manifest: { id: 'text', version },
      artifact: { id: 'materials-react', platform: 'web', digest: `sha256:${byte.repeat(64)}` },
    },
  },
  pureFunctions: {},
});

it('presents the installed version by default and finds a retained build by exact digest', () => {
  const installed = snapshot('installed', '2.0.0', '1');
  const old = snapshot('old', '1.0.0', '2');
  const earlier = snapshot('earlier', '1.0.0', '3');
  const catalog = new WebAssetCatalog(installed, [old, earlier, old]);

  expect(catalog.entries('materials')).toEqual([installed.materials.text]);
  expect(catalog.entries('materials', true)).toEqual([
    installed.materials.text,
    old.materials.text,
    earlier.materials.text,
  ]);
  expect(catalog.find('materials', 'text')).toBe(installed.materials.text);
  expect(catalog.find('materials', 'text', '1.0.0')).toBeUndefined();
  expect(catalog.find('materials', 'text', '1.0.0', earlier.materials.text!.artifact.digest)).toBe(
    earlier.materials.text,
  );
  expect(
    catalog.find('materials', 'text', '2.0.0', earlier.materials.text!.artifact.digest),
  ).toBeUndefined();
});

it('rejects a changed contract under an already registered asset version', () => {
  const installed = snapshot('installed', '1.0.0', '1');
  const old = snapshot('old', '1.0.0', '2');
  old.materials.text!.manifest.propsSchema = { type: 'object' };
  expect(() => new WebAssetCatalog(installed, [old])).toThrow('without a new capability version');
});

it('allows the deployment to recommend an archive and retain another build only for existing bindings', () => {
  const installed = snapshot('installed', '2.0.0', '1');
  const old = snapshot('archive', '1.0.0', '2');
  const current = installed.materials.text!;
  const retained = old.materials.text!;
  const catalog = new WebAssetCatalog(
    installed,
    [old],
    [
      {
        kind: 'materials',
        id: 'text',
        version: retained.manifest.version,
        artifactDigest: retained.artifact.digest,
        policy: 'recommend',
      },
      {
        kind: 'materials',
        id: 'text',
        version: current.manifest.version,
        artifactDigest: current.artifact.digest,
        policy: 'retain-only',
      },
    ],
  );
  expect(catalog.find('materials', 'text')).toBe(retained);
  expect(catalog.find('materials', 'text', current.manifest.version, current.artifact.digest)).toBe(
    current,
  );
  expect(catalog.selectable('materials', current)).toBe(false);
  expect(catalog.isInstalled('materials', retained)).toBe(false);
});
