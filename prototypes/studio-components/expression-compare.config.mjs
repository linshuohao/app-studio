import base from './expression-demo.config.mjs';
import { fileURLToPath } from 'node:url';
export default {
  ...base,
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    ...base.build,
    lib: {
      entry: fileURLToPath(new URL('./expression-compare.jsx', import.meta.url)),
      name: 'ExpressionCompare',
      formats: ['iife'],
      fileName: () => 'expression-compare.js',
    },
  },
};
