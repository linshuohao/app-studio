import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { inventory } from './assets/catalog.mjs';
const scratch = mkdtempSync(join(tmpdir(), 'form-engine-consumer-'));
const enginePackages = readdirSync('packages').filter((name) => name !== 'studio-design');
// Native pnpm distributions may not read npm_config_* rc variables themselves.
// Forward an explicitly selected existing cache through the public CLI option.
const run = (args, cwd = process.cwd()) =>
  execFileSync(
    'pnpm',
    [
      ...(process.env.npm_config_store_dir
        ? ['--store-dir', process.env.npm_config_store_dir]
        : []),
      ...args,
    ],
    { cwd, stdio: 'inherit' },
  );
try {
  const assets = await inventory(process.cwd());
  const expected = Object.fromEntries(
    ['material', 'function'].map((kind) => [
      kind,
      Object.fromEntries(
        assets
          .filter((asset) => asset.kind === kind)
          .map((asset) => [`${asset.symbol}Manifest`, asset.id]),
      ),
    ]),
  );
  for (const name of enginePackages)
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
  const overrides = enginePackages.map((name) => {
    const manifest = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
    const tarball = archives.find((path) =>
      path.endsWith(`form-engine-${name}-${manifest.version}.tgz`),
    );
    assert(tarball, `Missing tarball for ${name}`);
    return `  '${manifest.name}': 'file:${tarball}'`;
  });
  writeFileSync(join(scratch, 'pnpm-workspace.yaml'), `overrides:\n${overrides.join('\n')}\n`);
  // The standalone consumer resolves its own dependencies, even on a cold CI cache.
  run(['add', '--prefer-offline', ...archives, `react@${react}`, `react-dom@${reactDom}`], scratch);
  copyFileSync(
    new URL('./assets/packed-asset-exports.mjs', import.meta.url),
    join(scratch, 'packed-asset-exports.mjs'),
  );
  writeFileSync(
    join(scratch, 'verify-manifests.mjs'),
    `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    import { readFileSync } from 'node:fs';
    import { verifyManifestExports } from './packed-asset-exports.mjs';
    registerHooks({ resolve(specifier, context, next) {
      if (/^(react(?:-dom)?(?:\\/|$)|@form-engine\\/(renderer-react|runtime)(?:\\/|$))/.test(specifier))
        throw Error('Static contracts loaded UI or Runtime: ' + specifier);
      return next(specifier, context);
    } });
    const functions = await import('@form-engine/pure-functions/manifests');
    assert.equal(functions.textIsNonBlankManifest.id, 'text.isNonBlank');
    verifyManifestExports('pure-functions', functions, ${JSON.stringify(expected.function)});
    assert.equal(functions.dateAgeInYearsManifest.id, 'date.ageInYears');
    assert.equal(functions.travelPersonPremiumManifest.parameters[0].schema, true);
    assert.equal(functions.dateInclusiveDaysManifest.returns.type.includes('null'), true);
    const { webAssetCompatibility } = await import('@form-engine/materials-react/web-asset-compatibility');
    assert.equal(typeof webAssetCompatibility, 'function');
    const materials = await import('@form-engine/materials-react/manifests');
    verifyManifestExports('materials-react', materials, ${JSON.stringify(expected.material)});
    assert.equal(materials.arrayEditorManifest.id, 'array-editor');
    assert.equal(materials.textInputManifest.bindings.value.schema.type[0], 'string');
    assert.doesNotMatch(readFileSync(new URL(import.meta.resolve('@form-engine/materials-react/manifests')), 'utf8'), /use client/);
    console.log('Static manifest consumers: ${Object.keys(expected.material).length} materials and ${Object.keys(expected.function).length} functions match the registry without loading UI or Runtime.');
  `,
  );
  execFileSync('node', ['verify-manifests.mjs'], { cwd: scratch, stdio: 'inherit' });
  writeFileSync(
    join(scratch, 'verify.mjs'),
    `
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { compile, validateMaterialManifest } from '@form-engine/compiler';
    import { createRuntime } from '@form-engine/runtime';
    import { getDevtoolsHook } from '@form-engine/runtime/devtools';
    import { createObservationClient } from '@form-engine/devtools';
    globalThis.window = globalThis; // Only the isolated consumer simulates a browser discovery realm.
    import { createCoreFunctions, createTravelTotalPremium, createDateInclusiveDays } from '@form-engine/pure-functions';
    import { createElement } from 'react';
    import { renderToString } from 'react-dom/server';
    import { FormRenderer, useMaterialAdapter, defineMaterialContract, defineMaterial, createMaterialRegistry } from '@form-engine/renderer-react';
    const artifact = { id: 'consumer-build', platform: 'web', digest: 'sha256:' + '1'.repeat(64) };
    const functions = createCoreFunctions(artifact);
    assert.equal(functions['core.add'].invoke([2, 3]), 5);
    const ratePolicy = { agePolicy: { minAge: 0, maxAge: 80, adultAge: 18 }, maxDays: 30, maxInsureds: 5, rates: { basic: { adultDailyMinor: 100, childDailyMinor: 150 }, plus: { adultDailyMinor: 180, childDailyMinor: 250 } } };
    assert.equal(createTravelTotalPremium(artifact).invoke([[{age:30},{age:12}],'basic',2,ratePolicy]),500);
    assert.equal(createDateInclusiveDays(artifact).invoke(['2028-02-28','2028-03-01']),3);
    assert.equal(Object.hasOwn(functions,'travel.totalPremium'),false);

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
    assert.equal(Object.isFrozen(compiled.prepared.definition.views.only), true);
    assert.throws(() => { compiled.prepared.definition.id = 'mutated'; }, TypeError);
    assert.equal(compiled.prepared.definition.views.only.material, 'display');
    assert.deepEqual(compiled.prepared.definition.views.only.props.label.watch, [{ source: 'data', path: '/name' }]);
    assert.deepEqual(compiled.prepared.definition.constraints[0].watch, []);
    assert.deepEqual(JSON.parse(JSON.stringify(compiled.prepared)), compiled.prepared);
    assert.match(compiled.prepared.capabilityLock.materials.display.manifestDigest, /^sha256:[a-f0-9]{64}$/);
    const runtime = createRuntime({ prepared: compiled.prepared, data: { name: 'Ada', age: 20, total: 0 }, functions });
    assert.equal(runtime.dispatch({ op: 'set', target: { source: 'data', path: '/missing/child' }, value: 1 }).ok, false);
    assert.equal(runtime.diagnostics().find(entry => entry.kind === 'command.error').evidence.prepared, compiled.prepared, 'Packed Compiler and Runtime share the immutable artifact');
    const development = process.execArgv.includes('--conditions=development');
    assert.equal(Boolean(getDevtoolsHook()), development, 'Only development package conditions may register discovery');
    const prior = runtime.snapshot();
    if (development) {
      const client = createObservationClient({ request: async command => getDevtoolsHook().request(command) }, () => crypto.randomUUID());
      const discovery = (await client.query({ op: 'discover' })).result;
      assert.equal(discovery.status, 'ok');
      assert.equal(discovery.producers.filter(source => source.kind === 'runtime').length, 1);
      const producer = discovery.producers[0].ref;
      const opened = (await client.query({ op: 'openObservation', producer })).result;
      assert.equal(opened.status, 'ok');
      const target = { producer, sessionId: opened.sessionId };
      const page = (await client.query({ op: 'readSnapshotPage', ...target, snapshotId: opened.snapshotId })).result;
      assert.equal(page.status, 'ok');
      assert.ok(page.rows.some(row => row.record === 'header'));
      assert.equal(JSON.stringify(page.rows).includes('Ada'), false);
      assert.equal((await client.query({ op: 'closeObservation', ...target })).result.status, 'closed');
    }
    runtime.dispatch({ op: 'set', target: { source: 'data', path: '/name' }, value: 'Grace' });
    await runtime.flush();
    assert.deepEqual(prior, { name: 'Ada', age: 20, total: 0 });
    assert.deepEqual(runtime.snapshot(), { name: 'Grace', age: 20, total: 22 });
    assert.equal((await runtime.validate()).status, 'valid');
    const displayContract = defineMaterialContract(material);
    const Display = () => createElement('span', null, String(useMaterialAdapter(displayContract).props.label));
    const registry = createMaterialRegistry([defineMaterial(displayContract, artifact, Display)]);
    // 打包消费者的只读呈现冒烟，不声明 SSR 水合支持。
    const markup = renderToString(createElement(FormRenderer, { prepared: compiled.prepared, runtime, materials: registry }));
    assert.ok(markup.includes('>Grace</span>'));
    runtime.dispose();
    if (development) assert.equal(getDevtoolsHook().request({ version: 2, requestId: 'after-dispose', op: 'discover' }).result.producers.length, 0);
    const protocolSchema = JSON.parse(readFileSync(new URL(import.meta.resolve('@form-engine/protocol/schemas/form-definition.schema.json')), 'utf8'));
    assert.equal(protocolSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    for (const domain of ['definition', 'capability', 'prepared'])
      assert.deepEqual(Object.keys(await import('@form-engine/protocol/' + domain)), []);
    // 正式物料库仍待实现；Renderer 已通过真实 Prepared 的打包消费。
    await import('@form-engine/renderer-react');
    const { createValueDisplay } = await import('@form-engine/materials-react');
    const { valueDisplayManifest } = await import('@form-engine/materials-react/manifests');
    const displayed = compile({definition: {protocolVersion:'consumer-test',id:'material-consumer',version:'test',data:{schema:{type:'object'}},views:{main:{material:'value-display',props:{value:500,format:'moneyMinor'}}}},catalog:{id:'material-consumer',materials:{'value-display':{manifest:valueDisplayManifest,artifact}},pureFunctions:{}}});
    assert.equal(displayed.success,true,JSON.stringify(displayed.diagnostics));
    const displayRuntime=createRuntime({prepared:displayed.prepared,data:{}});
    const officialMarkup=renderToString(createElement(FormRenderer,{prepared:displayed.prepared,runtime:displayRuntime,materials:createMaterialRegistry([createValueDisplay(artifact)])}));
    assert.ok(officialMarkup.includes('¥5.00'));
    displayRuntime.dispose();
    const styles=readFileSync(new URL(import.meta.resolve('@form-engine/materials-react/styles.css')),'utf8');
    assert.ok(styles.includes('.fe-input'));
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
import { defineMaterialContract, defineRequest, defineHostRequests, useMaterialAdapter } from '@form-engine/renderer-react';
const request = defineRequest<string, string[]>({ payloadSchema: { type: 'string' }, resultSchema: { type: 'array', items: { type: 'string' } } });
const requestContracts = { search: request };
const viewContract = defineMaterialContract<object, 'value', Record<string, never>, typeof requestContracts>({ id: 'typed-material', version: 'test', requests: requestContracts });
function MaterialConsumer() {
  const adapter = useMaterialAdapter(viewContract);
  adapter.request('search', 'hello');
  // @ts-expect-error Wrong request payload must remain an error in packed declarations.
  adapter.request('search', 42);
  // @ts-expect-error Unknown binding name must remain an error in packed declarations.
  adapter.set('missing', 'value');
}
defineHostRequests({ lookup: request }, { lookup: input => [input] });
import { remoteSelectRequests, type RemoteSelectSearchInput } from '@form-engine/materials-react';
const cityInput: RemoteSelectSearchInput = { query: '杭州', filterKey: 'CN' };
defineHostRequests({ cities: remoteSelectRequests.search }, { cities: input => ({ items: [{ id: input.filterKey ?? '', label: input.query }] }) });
// @ts-expect-error Packed remote-select declarations reject malformed Host results.
defineHostRequests({ cities: remoteSelectRequests.search }, { cities: () => ({ items: ['wrong'] }) });
// @ts-expect-error The normalized filter key is required in Host input.
const missingFilter: RemoteSelectSearchInput = { query: cityInput.query };

// @ts-expect-error Required statically-known Host registration cannot be omitted.
defineHostRequests({ lookup: request }, {});
void MaterialConsumer;
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
if (compilerResult.success) {
  const output: import('@form-engine/protocol/prepared').ReadonlyPreparedForm = compilerResult.prepared;
  // @ts-expect-error Compiled artifacts are deeply readonly, including nested fields.
  output.definition.data.schema = false;
  const editable = structuredClone(output) as PreparedForm;
  editable.definition.data.schema = false;
  void editable;
}
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
  for (const name of enginePackages) {
    const pkg = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'));
    assert(pkg.exports['.'].types && pkg.exports['.'].import);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
