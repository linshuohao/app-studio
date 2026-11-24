import { defineConfig } from 'tsdown';
/** 扩展以自身目录为根，独立构建，避免引用根目录的共享 chunk。 */
export default defineConfig({
  entry: { panel: 'src/extension/panel.ts', content: 'src/extension/content.ts' },
  outDir: 'dist/extension',
  format: 'esm',
  platform: 'browser',
  deps: { alwaysBundle: [/^@form-engine\//] },
  dts: false,
  sourcemap: true,
  clean: true,
});
