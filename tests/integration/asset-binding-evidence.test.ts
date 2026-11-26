import { expect, it } from 'vitest';
import { recoverLegacyAssetBindings } from '../../services/api/src/platform/asset-binding-evidence';

const digest = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;
function publication(profile: string, artifact: string, platform = 'web') {
  return {
    build: { profile, platform, catalogSnapshotId: 'test' },
    capabilityLock: {
      materials: {
        input: {
          id: 'input',
          version: '1.0.0',
          manifestDigest: digest('a'),
          artifact: { id: 'materials-react', platform, digest: digest(artifact) },
        },
      },
      pureFunctions: {},
    },
  };
}

it('recovers repeated evidence and treats different build digests as pending', () => {
  const old = publication('main', '1');
  expect(recoverLegacyAssetBindings([old, old])[0]?.dependencies[0]).toMatchObject({
    kind: 'materials',
    id: 'input',
    status: 'recoverable',
    lock: old.capabilityLock.materials.input,
  });
  expect(
    recoverLegacyAssetBindings([old, publication('main', '2')])[0]?.dependencies[0],
  ).toMatchObject({ kind: 'materials', id: 'input', status: 'pending' });
});

it('keeps profiles independent and ignores evidence from other platforms', () => {
  const main = publication('main', '1');
  const popup = publication('popup', '2');
  expect(
    recoverLegacyAssetBindings([main, popup, publication('main', '3', 'flutter')]),
  ).toMatchObject([
    {
      target: { profile: 'main' },
      dependencies: [{ status: 'recoverable', lock: main.capabilityLock.materials.input }],
    },
    {
      target: { profile: 'popup' },
      dependencies: [{ status: 'recoverable', lock: popup.capabilityLock.materials.input }],
    },
  ]);
  expect(recoverLegacyAssetBindings([])).toEqual([]);
});
