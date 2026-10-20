// Development only: compile workspace TypeScript with Nest decorator metadata.
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformSync } from '@swc/core';
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        error.code === 'ERR_MODULE_NOT_FOUND' &&
        specifier.startsWith('.') &&
        specifier.endsWith('.js') &&
        context.parentURL
      ) {
        const candidate = new URL(specifier.slice(0, -3) + '.ts', context.parentURL);
        if (existsSync(candidate)) return nextResolve(candidate.href, context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url) && !url.includes('/node_modules/')) {
      const filename = fileURLToPath(url);
      const { code } = transformSync(readFileSync(filename, 'utf8'), {
        filename,
        sourceMaps: 'inline',
        jsc: {
          parser: { syntax: 'typescript', tsx: url.endsWith('.tsx'), decorators: true },
          transform: {
            legacyDecorator: true,
            decoratorMetadata: true,
            react: { runtime: 'automatic' },
          },
          target: 'es2023',
        },
        module: { type: 'es6' },
      });
      return { format: 'module', source: code, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
