// pnpm exec vite build --config packages/studio-design/handbook/studio-components/menu-demo.config.mjs
import { fileURLToPath } from 'node:url';
const path = (relative) => fileURLToPath(new URL(relative, import.meta.url));
export default {
  resolve: {
    alias: Object.fromEntries(
      ['react-dom', 'react', '@base-ui/react'].map((name) => [
        name,
        path('../../../../apps/studio/node_modules/' + name),
      ]),
    ),
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  build: {
    emptyOutDir: false,
    outDir: path('./assets'),
    copyPublicDir: false,
    lib: {
      entry: path('./menu-demo.jsx'),
      name: 'StudioMenuSample',
      formats: ['iife'],
      fileName: () => 'menu-demo.js',
    },
  },
};
