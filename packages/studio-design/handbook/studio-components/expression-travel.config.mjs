import base from './expression-demo.config.mjs';
import { fileURLToPath } from 'node:url';
import { buildIdentity } from '../../../../services/api/src/platform/build-identity.ts';
function packageDigest(name) {
  const path = fileURLToPath(new URL('../../../' + name + '/package.json', import.meta.url));
  return JSON.stringify(buildIdentity(path, name).digest);
}
export default {
  ...base,
  // The offline Studio preview runs without the release pipeline's Node environment.
  define: {
    ...base.define,
    'process.env.RELEASE_MATERIAL_DIGEST': packageDigest('materials-react'),
    'process.env.RELEASE_FUNCTION_DIGEST': packageDigest('pure-functions'),
  },
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    ...base.build,
    lib: {
      entry: fileURLToPath(new URL('./expression-travel.jsx', import.meta.url)),
      name: 'ExpressionTravel',
      cssFileName: 'expression-travel',
      formats: ['iife'],
      fileName: () => 'expression-travel.js',
    },
  },
};
