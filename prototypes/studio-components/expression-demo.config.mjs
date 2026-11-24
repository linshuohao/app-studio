import base from './select-demo.config.mjs';
import { fileURLToPath } from 'node:url';
const local = (path) => fileURLToPath(new URL(path, import.meta.url));
export default {
  ...base,
  resolve: {
    alias: {
      '@form-engine/runtime/devtools': local('../../packages/runtime/dist/devtools/index.js'),
      ...base.resolve.alias,
      ...Object.fromEntries(
        ['compiler', 'runtime', 'pure-functions'].map((name) => [
          '@form-engine/' + name,
          local('../../apps/playground/node_modules/@form-engine/' + name),
        ]),
      ),
    },
  },
  build: {
    ...base.build,
    lib: {
      entry: local('../expression-editor.jsx'),
      name: 'ExpressionSample',
      formats: ['iife'],
      fileName: () => 'expression-demo.js',
      cssFileName: 'expression-demo',
    },
  },
};
