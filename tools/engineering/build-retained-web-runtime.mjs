import { createRequire } from 'node:module';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildIdentity } from '../../services/api/src/platform/build-identity.ts';

const requireRuntimeTool = createRequire(
  new URL('../../packages/runtime/package.json', import.meta.url),
);
const requireBundler = createRequire(requireRuntimeTool.resolve('tsdown'));

export async function buildRetainedWebRuntime({
  runtimeRoot,
  functionsRoot,
  runtimeDigest,
  functionsDigest,
  output,
}) {
  for (const [root, id, expected] of [
    [runtimeRoot, 'runtime', runtimeDigest],
    [functionsRoot, 'pure-functions', functionsDigest],
  ]) {
    if (buildIdentity(join(root, 'package.json'), id).digest !== expected)
      throw new Error(`Retained Web package digest does not match: ${id}`);
  }
  const { rolldown } = await import(pathToFileURL(requireBundler.resolve('rolldown')).href);
  const working = await mkdtemp(join(dirname(output), '.web-runtime-'));
  try {
    const functionEntry = join(functionsRoot, 'dist', 'index.js');
    const runtimeEntry = join(runtimeRoot, 'dist', 'index.js');
    const entry = join(working, 'index.mjs');
    await writeFile(
      entry,
      `
      export * as functions from ${JSON.stringify(functionEntry)};
      export { createRuntime } from ${JSON.stringify(runtimeEntry)};
    `,
    );
    const bundle = await rolldown({
      input: entry,
      platform: 'browser',
      external: (id) => id.startsWith('@form-engine/protocol/'),
      plugins: [
        {
          name: 'retained-pure-functions',
          resolveId(id) {
            if (id === '@form-engine/pure-functions') return functionEntry;
          },
        },
      ],
    });
    try {
      await bundle.write({ file: output, format: 'esm', inlineDynamicImports: true });
    } finally {
      await bundle.close();
    }
  } finally {
    await rm(working, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [runtimeRoot, functionsRoot, runtimeDigest, functionsDigest, output] =
    process.argv.slice(2);
  if (!runtimeRoot || !functionsRoot || !runtimeDigest || !functionsDigest || !output)
    throw new Error(
      'Usage: node build-retained-web-runtime.mjs <runtime-root> <functions-root> <runtime-digest> <functions-digest> <output.mjs>',
    );
  await buildRetainedWebRuntime({
    runtimeRoot: resolve(runtimeRoot),
    functionsRoot: resolve(functionsRoot),
    runtimeDigest,
    functionsDigest,
    output: resolve(output),
  });
}
