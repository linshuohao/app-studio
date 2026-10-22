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
  const reactTypes = JSON.parse(
    readFileSync('apps/playground/node_modules/@types/react/package.json', 'utf8'),
  ).version;
  const reactDomTypes = JSON.parse(
    readFileSync('apps/playground/node_modules/@types/react-dom/package.json', 'utf8'),
  ).version;
  const react = JSON.parse(
    readFileSync('apps/playground/node_modules/react/package.json', 'utf8'),
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
  run(
    [
      'add',
      '--offline',
      ...archives,
      `react@${react}`,
      `react-dom@${react}`,
      `@types/react@${reactTypes}`,
      `@types/react-dom@${reactDomTypes}`,
    ],
    scratch,
  );
  writeFileSync(
    join(scratch, 'verify.mjs'),
    `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { createElement } from 'react';
    import { renderToStaticMarkup } from 'react-dom/server';
    import { inspectEngineeringMarker } from '@form-engine/compiler/engineering';
    import { compile, validateMaterialManifest } from '@form-engine/compiler';
    import { getEngineeringLabel } from '@form-engine/runtime/engineering';
    import { EngineeringPanel } from '@form-engine/renderer-react/engineering';
    import { EngineeringInput } from '@form-engine/materials-react/engineering';
    assert.equal(inspectEngineeringMarker(), 'form-engine-workspace');
    const material = { id: 'display', version: 'consumer-test' };
    assert.equal(validateMaterialManifest(material).valid, true);
    const compiled = compile({
      definition: { protocolVersion: 'consumer-test', id: 'compiled', version: 'draft',
        data: { schema: { type: 'object', properties: { name: { type: 'string' } } } },
        constraints: [{ id: 'name-check', kind: 'internal', assert: true, issue: { target: { source: 'data', path: '/name' }, code: 'NAME' } }],
        views: { only: { material: 'display', props: { label: { $expr: { ref: { source: 'data', path: '/name' } } } } } } },
      catalog: { id: 'consumer-catalog', materials: { display: { manifest: material,
        artifact: { id: 'consumer-build', platform: 'web', digest: 'sha256:' + '1'.repeat(64) } } }, pureFunctions: {} },
    });
    assert.equal(compiled.success, true, JSON.stringify(compiled.diagnostics));
    assert.equal(compiled.prepared.build.profile, 'only');
    assert.equal(compiled.prepared.definition.views.only.material, 'display');
    assert.deepEqual(compiled.prepared.definition.views.only.props.label.watch, [{ source: 'data', path: '/name' }]);
    assert.deepEqual(compiled.prepared.definition.constraints[0].watch, []);
    assert.deepEqual(JSON.parse(JSON.stringify(compiled.prepared)), compiled.prepared);
    assert.match(compiled.prepared.capabilityLock.materials.display.manifestDigest, /^sha256:[a-f0-9]{64}$/);
    assert.match(getEngineeringLabel(), /form-engine-workspace/);
    const markup = renderToStaticMarkup(createElement(EngineeringPanel, null, createElement(EngineeringInput, { 'aria-label': 'sample' })));
    assert.match(markup, /fe-engineering-input/);
    const css = readFileSync(new URL(import.meta.resolve('@form-engine/materials-react/styles.css')), 'utf8');
    assert.match(css, /fe-engineering-input/);
    const protocolSchema = JSON.parse(readFileSync(new URL(import.meta.resolve('@form-engine/protocol/schemas/form-definition.schema.json')), 'utf8'));
    assert.equal(protocolSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    for (const domain of ['definition', 'capability', 'prepared']) {
      assert.deepEqual(Object.keys(await import('@form-engine/protocol/' + domain)), []);
    }
    console.log('Isolated packed consumer: JS, exports, React and CSS passed');
  `,
  );
  execFileSync('node', ['verify.mjs'], { cwd: scratch, stdio: 'inherit' });
  // Packed packages must also work in downstream development without workspace src.
  execFileSync('node', ['--conditions=development', 'verify.mjs'], {
    cwd: scratch,
    stdio: 'inherit',
  });
  writeFileSync(
    join(scratch, 'verify.ts'),
    `import { inspectEngineeringMarker } from '@form-engine/compiler/engineering';\nimport { EngineeringInput } from '@form-engine/materials-react/engineering';\nimport { EngineeringPanel } from '@form-engine/renderer-react/engineering';\nimport type { ComponentProps } from 'react';\nimport type { FormDefinition, SetCommand, DataReference } from '@form-engine/protocol/definition';\nimport type { MaterialManifest } from '@form-engine/protocol/capability';\nimport type { PreparedForm } from '@form-engine/protocol/prepared';\nconst marker: string = inspectEngineeringMarker();\nconst input: ComponentProps<typeof EngineeringInput> = { value: marker };\nconst panel: ComponentProps<typeof EngineeringPanel> = { children: marker };\nconst reference: DataReference = { source: 'data', path: '/name' };\nconst command: SetCommand = { op: 'set', target: reference, value: 'Ada' };\nconst definition: FormDefinition = { protocolVersion: 'consumer-test', id: 'consumer', version: 'draft', data: { schema: { type: 'object' } }, views: { desktop: { material: 'input', bindings: { value: reference } } } };\nconst manifest: MaterialManifest = { id: 'input', version: 'consumer-test', bindings: { value: { schema: { type: 'string' } } }, slots: ['default'], events: { select: { payloadSchema: { type: 'string' } } } };\ntype PreparedInput = PreparedForm['definition'];\n// @ts-expect-error event references are read-only and cannot be command targets\nconst invalid: SetCommand = { op: 'set', target: { source: 'event', path: '/value' }, value: 1 };\nexport type { PreparedInput };\nexport { command, definition, manifest, invalid };\nexport { marker, input, panel };\n`,
  );
  const typeSample = join(scratch, 'verify.ts');
  writeFileSync(
    typeSample,
    readFileSync(typeSample, 'utf8') +
      `
import { compile, validatePureFunctionManifest } from '@form-engine/compiler';
import type { CompileInput, CompileResult, Diagnostic } from '@form-engine/compiler';
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
export { compilerResult, diagnostics, checked };
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
  // The type path is part of the public export contract, not a source alias.
  for (const name of readdirSync('packages')) {
    const pkg = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
    assert(pkg.exports['.'].types && pkg.exports['./engineering'].types);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
