import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
const scratch = mkdtempSync(join(tmpdir(), 'form-engine-consumer-'));
const run = (args, cwd = process.cwd()) => execFileSync('pnpm', args, { cwd, stdio: 'inherit' });
try {
  for (const name of readdirSync('packages'))
    run(['--dir', `packages/${name}`, 'pack', '--pack-destination', scratch]);
  run(['init', '--bare', '--init-type', 'module', '--no-init-package-manager'], scratch);
  // Satisfy the React packages' declared peers without introducing demonstration components.
  const react = JSON.parse(
    readFileSync('apps/playground/node_modules/react/package.json', 'utf8'),
  ).version;
  const reactDom = JSON.parse(
    readFileSync('apps/playground/node_modules/react-dom/package.json', 'utf8'),
  ).version;
  const archives = readdirSync(scratch)
    .filter((name) => name.endsWith('.tgz'))
    .map((name) => join(scratch, name));
  const overrides = readdirSync('packages').map((name) => {
    const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
    const tarball = archives.find((path) =>
      path.endsWith(`form-engine-${name}-${manifest.version}.tgz`),
    );
    assert(tarball, `Missing tarball for ${name}`);
    return `  '${manifest.name}': 'file:${tarball}'`;
  });
  writeFileSync(join(scratch, 'pnpm-workspace.yaml'), `overrides:\n${overrides.join('\n')}\n`);
  run(['add', '--offline', ...archives, `react@${react}`, `react-dom@${reactDom}`], scratch);
  writeFileSync(
    join(scratch, 'verify.mjs'),
    `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { compile, validateMaterialManifest } from '@form-engine/compiler';
    import { createRuntime } from '@form-engine/runtime';
    import { createCoreFunctions } from '@form-engine/pure-functions';
    const artifact = { id: 'consumer-build', platform: 'web', digest: 'sha256:' + '1'.repeat(64) };
    const functions = createCoreFunctions(artifact);
    assert.equal(functions['core.add'].invoke([2, 3]), 5);
    const material = { id: 'display', version: 'consumer-test' };
    assert.equal(validateMaterialManifest(material).valid, true);
    const compiled = compile({
      definition: { protocolVersion: 'consumer-test', id: 'compiled', version: 'draft',
        data: { schema: { type: 'object', properties: { name: { type: 'string' }, age: { type: 'number' }, total: { type: 'number' } } } },
        constraints: [{ id: 'name-check', kind: 'internal', assert: true, issue: { target: { source: 'data', path: '/name' }, code: 'NAME' } }],
        reactions: [{ id: 'total', watch: [{ source: 'data', path: '/age' }], runOnActivate: true, then: [
          { op: 'set', target: { source: 'data', path: '/total' }, value: { $expr: { op: 'core.add', args: [{ ref: { source: 'data', path: '/age' } }, 2] } } },
        ] }],
        views: { only: { material: 'display', props: { label: { $expr: { ref: { source: 'data', path: '/name' } } } } } } },
      catalog: { id: 'consumer-catalog', materials: { display: { manifest: material, artifact } },
        pureFunctions: Object.fromEntries(Object.entries(functions).map(([id, binding]) => [id, { manifest: binding.manifest, artifact: binding.artifact }])) },
    });
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    assert.equal(compiled.prepared.build.profile, 'only');
    assert.equal(compiled.prepared.definition.views.only.material, 'display');
    assert.deepEqual(compiled.prepared.definition.views.only.props.label.watch, [{ source: 'data', path: '/name' }]);
    assert.deepEqual(compiled.prepared.definition.constraints[0].watch, []);
    assert.deepEqual(JSON.parse(JSON.stringify(compiled.prepared)), compiled.prepared);
    assert.match(compiled.prepared.capabilityLock.materials.display.manifestDigest, /^sha256:[a-f0-9]{64}$/);
    const runtime = createRuntime({ prepared: compiled.prepared, data: { name: 'Ada', age: 20, total: 0 }, functions });
    const prior = runtime.snapshot();
    runtime.dispatch({ op: 'set', target: { source: 'data', path: '/name' }, value: 'Grace' });
    await runtime.flush();
    assert.deepEqual(prior, { name: 'Ada', age: 20, total: 0 });
    assert.deepEqual(runtime.snapshot(), { name: 'Grace', age: 20, total: 22 });
    assert.equal((await runtime.validate()).status, 'valid');
    runtime.dispose();
    const protocolSchema = JSON.parse(readFileSync(new URL(import.meta.resolve('@form-engine/protocol/schemas/form-definition.schema.json')), 'utf8'));
    assert.equal(protocolSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    for (const domain of ['definition', 'capability', 'prepared'])
      assert.deepEqual(Object.keys(await import('@form-engine/protocol/' + domain)), []);
    // Future Renderer / Material implementations must still have consumable main entries.
    await import('@form-engine/renderer-react');
    await import('@form-engine/materials-react');
    console.log('Isolated packed consumer: pure functions, Compiler → Runtime, exports and Schema passed');
  `,
  );
  execFileSync('node', ['verify.mjs'], { cwd: scratch, stdio: 'inherit' });
  execFileSync('node', ['--conditions=development', 'verify.mjs'], {
    cwd: scratch,
    stdio: 'inherit',
  });
  writeFileSync(
    join(scratch, 'verify.ts'),
    `
import type { ArtifactIdentity } from '@form-engine/protocol';
import type { FormDefinition, SetCommand, DataReference } from '@form-engine/protocol/definition';
import type { MaterialManifest } from '@form-engine/protocol/capability';
import type { PreparedForm } from '@form-engine/protocol/prepared';
import { compile, validatePureFunctionManifest } from '@form-engine/compiler';
import type { CompileInput, CompileResult, Diagnostic } from '@form-engine/compiler';
import { createRuntime, type FullValidationResult } from '@form-engine/runtime';
import { createCoreFunctions, type FunctionRegistry } from '@form-engine/pure-functions';
const reference: DataReference = { source: 'data', path: '/name' };
const command: SetCommand = { op: 'set', target: reference, value: 'Ada' };
const definition: FormDefinition = { protocolVersion: 'consumer-test', id: 'consumer', version: 'draft', data: { schema: { type: 'object' } }, views: { desktop: { material: 'input', bindings: { value: reference } } } };
const manifest: MaterialManifest = { id: 'input', version: 'consumer-test', bindings: { value: { schema: { type: 'string' } } }, slots: ['default'], events: { select: { payloadSchema: { type: 'string' } } } };
type PreparedInput = PreparedForm['definition'];
// @ts-expect-error Event references are read-only and cannot be Command targets.
const invalid: SetCommand = { op: 'set', target: { source: 'event', path: '/value' }, value: 1 };
const compilerInput: CompileInput = { definition, catalog: { id: 'typed-catalog', materials: {}, pureFunctions: {} } };
const compilerResult: CompileResult = compile(compilerInput);
const diagnostics: Diagnostic[] = compilerResult.diagnostics;
if (compilerResult.success) { const output: PreparedForm = compilerResult.prepared; void output; }
else {
  // @ts-expect-error Failed compilation must not expose an executable Prepared.
  const invalidOutput: PreparedForm = compilerResult.prepared;
  void invalidOutput;
}
const checked = validatePureFunctionManifest({ id: 'fn', version: 'test', parameters: [], returns: true });
const artifact: ArtifactIdentity = { id: 'consumer-build', platform: 'web', digest: ('sha256:' + '1'.repeat(64)) as ArtifactIdentity['digest'] };
const functions: FunctionRegistry = createCoreFunctions(artifact);
if (compilerResult.success) {
  const runtime = createRuntime({ prepared: compilerResult.prepared, data: { name: 'Ada' }, functions });
  const proof: Promise<FullValidationResult> = runtime.validate();
  const snapshot = runtime.snapshot();
  // @ts-expect-error The Runtime owns Working Data; callers cannot write through a snapshot.
  snapshot.name = 'forbidden';
  void proof;
  runtime.dispose();
}
export type { PreparedInput };
export { command, definition, manifest, invalid, compilerResult, diagnostics, checked, functions };
`,
  );
  execFileSync(
    process.execPath,
    [
      resolve('node_modules/typescript/bin/tsc'),
      '--noEmit',
      '--strict',
      '--skipLibCheck',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--target',
      'ES2023',
      'verify.ts',
    ],
    { cwd: scratch, stdio: 'inherit' },
  );
  for (const name of readdirSync('packages')) {
    const pkg = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
    assert(pkg.exports['.'].types && pkg.exports['.'].import);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
