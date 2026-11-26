import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { compile } from '@form-engine/compiler';
import type { QueryExecutor } from '../../services/api/src/platform/database';
import {
  legacyAssetBindingEvidence,
  recoverLegacyAssetBindings,
} from '../../services/api/src/platform/asset-binding-evidence';

const digest = (char: string): `sha256:${string}` => `sha256:${char.repeat(64)}`;
function publication(profile: string, artifact: string, platform = 'web') {
  return {
    build: { profile, platform, catalogSnapshotId: 'test', compilerVersion: 'fixture' },
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

it('treats opaque or malformed releases as pending only for the affected Web target', async () => {
  const raw = (profile: string, prepared_text: string) => ({
    target: JSON.stringify({ platform: 'web', profile }),
    prepared_text,
    digest: 'sha256:' + createHash('sha256').update(prepared_text).digest('hex'),
  });
  const build = (profile: string) => {
    const checked = compile({
      definition: {
        protocolVersion: '1',
        id: 'legacy',
        version: '1',
        data: { schema: { type: 'object' } },
        views: { [profile]: { material: 'input' } },
      },
      target: { platform: 'web', profile },
      catalog: {
        id: 'legacy',
        materials: {
          input: {
            manifest: { id: 'input', version: '1.0.0' },
            artifact: { id: 'materials-react', platform: 'web', digest: digest('1') },
          },
        },
        pureFunctions: {},
      },
    });
    if (!checked.success) throw new Error(JSON.stringify(checked.diagnostics));
    return raw(profile, JSON.stringify(checked.prepared));
  };
  const rows = [build('main'), build('popup'), raw('main', '{"raw":true}'), raw('old', '{')];
  const db = { many: async () => rows } as unknown as QueryExecutor;
  expect(await legacyAssetBindingEvidence(db, 'form', 'revision')).toMatchObject({
    unobserved: 'pending',
    profiles: [
      {
        target: { platform: 'web', profile: 'popup' },
        dependencies: [{ id: 'input', status: 'recoverable' }],
      },
    ],
  });
});
