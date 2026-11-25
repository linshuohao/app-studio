import { exampleSources } from './example-source.config.mjs';
import base from './field-picker-demo.config.mjs';
import { fileURLToPath } from 'node:url';
export default {
  ...base,
  plugins: [exampleSources()],
  build: {
    ...base.build,
    lib: {
      ...base.build.lib,
      entry: fileURLToPath(new URL('./playground.jsx', import.meta.url)),
      name: 'StudioPlayground',
      cssFileName: 'playground',
      fileName: () => 'playground.js',
    },
  },
};
