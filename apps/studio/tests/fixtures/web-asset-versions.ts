import { createElement } from 'react';
import {
  defineMaterial,
  defineMaterialContract,
  useMaterialAdapter,
} from '@form-engine/renderer-react';
import type { ArtifactIdentity } from '@form-engine/protocol';
import type { WebCapabilities } from '../../src/app/host/resolve-capabilities';

const artifact = (id: string, char: string): ArtifactIdentity => ({
  id,
  platform: 'web',
  digest: `sha256:${char.repeat(64)}`,
});
function registrations(
  version: string,
  mark: string,
  marker: string,
  value: number,
): WebCapabilities {
  const contract = defineMaterialContract<{ result: number }>({
    id: 'version-result',
    version,
    propsSchema: { type: 'object', properties: { result: { type: 'integer' } } },
  });
  return {
    materials: {
      'version-result': defineMaterial(contract, artifact('materials-react', mark), () =>
        createElement('output', null, version + ':' + useMaterialAdapter(contract).props.result),
      ),
    },
    functions: {
      'version.calculate': {
        manifest: {
          id: 'version.calculate',
          version,
          parameters: [],
          returns: { type: 'integer' },
        },
        artifact: artifact('pure-functions', marker),
        invoke: () => value,
      },
    },
  };
}
export const retainedWebCapabilities = [
  registrations('2.0.0', 'c', 'd', 24),
  registrations('1.0.0', 'a', 'b', 12),
];
