import { defineConfig } from 'tsdown';
/** 安装包也提供开发条件产物，业务应用无需手动导入 DevTools 或修改 FormRenderer。 */
export default defineConfig({
  entry: ['src/index.ts', 'src/devtools/index.ts'],
  outDir: 'dist/development',
  format: 'esm',
  platform: 'neutral',
  dts: true,
  sourcemap: true,
  clean: true,
  define: { __FORM_ENGINE_DEVTOOLS_ENABLED__: 'true' },
  deps: { neverBundle: [/^@form-engine\//] },
});
