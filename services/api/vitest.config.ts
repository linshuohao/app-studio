import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';
export default defineConfig({
  resolve: { conditions: ['development'] },
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2023',
      },
      module: { type: 'es6' },
    }),
  ],
  test: { globals: true, environment: 'node', include: ['src/**/*.spec.ts'], restoreMocks: true },
});
