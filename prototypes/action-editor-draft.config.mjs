import base from './studio-components/expression-demo.config.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const path = (p) => fileURLToPath(new URL(p, import.meta.url));
const previewDigest = JSON.stringify('sha256:' + '5'.repeat(64));
export default {
  ...base,
  define: {
    ...base.define,
    'process.env.RELEASE_FUNCTION_DIGEST': previewDigest,
    'process.env.RELEASE_MATERIAL_DIGEST': previewDigest,
  },
  oxc: { jsx: { runtime: 'automatic' } },
  build: {
    ...base.build,
    outDir: path('.'),
    lib: {
      entry: path('./action-editor-draft.jsx'),
      formats: ['iife'],
      name: 'ActionDraft',
      fileName: () => 'action-editor-draft.js',
      cssFileName: 'action-editor-draft',
    },
  },
  plugins: [
    {
      name: 'standalone-action-draft',
      enforce: 'post',
      generateBundle(_, files) {
        const js = files['action-editor-draft.js'].code.replace(/<\/script/gi, '<\\/script');
        const css = files['action-editor-draft.css'].source;
        this.emitFile({
          type: 'asset',
          fileName: 'action-editor-draft.html',
          source: readFileSync(path('./action-editor-template.html'), 'utf8')
            .replace(
              '/* studio css */',
              () => readFileSync(path('../apps/studio/src/app/studio-ui.css'), 'utf8') + '\n' + css,
            )
            .replace('/* component script */', () => js),
        });
        delete files['action-editor-draft.js'];
        delete files['action-editor-draft.css'];
      },
    },
  ],
};
