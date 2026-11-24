import base from './select-demo.config.mjs';
import { fileURLToPath } from 'node:url';
export default {
  ...base,
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    ...base.build,
    lib: {
      entry: fileURLToPath(new URL('./field-picker-demo.jsx', import.meta.url)),
      name: 'FieldPickerSample',
      formats: ['iife'],
      fileName: () => 'field-picker-demo.js',
    },
  },
};
