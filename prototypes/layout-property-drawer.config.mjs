import { fileURLToPath } from 'node:url';
import base from './studio-components/expression-demo.config.mjs';

export default {
  ...base,
  define: {
    ...base.define,
    'process.env.RELEASE_MATERIAL_DIGEST': JSON.stringify('sha256:' + '5'.repeat(64)),
    'process.env.RELEASE_FUNCTION_DIGEST': JSON.stringify('sha256:' + '5'.repeat(64)),
  },
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    ...base.build,
    lib: {
      entry: fileURLToPath(new URL('./layout-property-drawer.jsx', import.meta.url)),
      name: 'LayoutPropertyDrawerReview',
      formats: ['iife'],
      fileName: () => 'layout-property-drawer.js',
      cssFileName: 'layout-property-drawer',
    },
  },
};
