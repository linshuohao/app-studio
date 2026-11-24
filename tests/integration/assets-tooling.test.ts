import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createAsset } from '../../tools/engineering/assets/create.mjs';
import { writeAssetChange } from '../../tools/engineering/assets/change.mjs';
import { checkAssets } from '../../tools/engineering/assets/check.mjs';
import { createReleasePlan } from '../../tools/engineering/release/plan.mjs';
import { applyReleasePlan } from '../../tools/engineering/release/apply.mjs';
import { checkRelease } from '../../tools/engineering/release/check.mjs';
import { applyEdits, withWorkspaceLock } from '../../tools/engineering/assets/files.mjs';

const roots: string[] = [];
const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
function put(root: string, path: string, content: string) {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), content);
}
function git(root: string, ...args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}
function commit(root: string) {
  git(root, 'add', '.');
  git(
    root,
    '-c',
    'user.name=Tooling Test',
    '-c',
    'user.email=tooling@example.invalid',
    'commit',
    '-qm',
    'fixture',
  );
  return git(root, 'rev-parse', 'HEAD');
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'form-assets-'));
  roots.push(root);
  put(
    root,
    'package.json',
    JSON.stringify({ name: 'fixture', private: true, packageManager: 'pnpm@12.14.0' }),
  );
  put(root, 'pnpm-workspace.yaml', 'packages:\n  - packages/*\n');
  put(
    root,
    '.changeset/config.json',
    JSON.stringify({
      baseBranch: 'main',
      changelog: '@changesets/cli/changelog',
      format: false,
      privatePackages: { version: true, tag: false },
    }),
  );
  for (const name of ['materials-react', 'pure-functions']) {
    put(
      root,
      `packages/${name}/package.json`,
      JSON.stringify({
        name: `@form-engine/${name}`,
        version: '1.0.0',
        private: true,
        type: 'module',
      }),
    );
    put(
      root,
      `packages/${name}/src/index.ts`,
      '// Existing public API must survive.\nexport const existing = 1;\n',
    );
  }
  git(root, 'init', '-q');
  return { root, base: commit(root) };
}
function implement(root: string, folder = 'text-is-non-blank') {
  const path = `packages/pure-functions/src/${folder}/`;
  put(
    root,
    `${path}implementation.ts`,
    "import type { JsonValue } from '@form-engine/protocol';\nexport function invoke(args: readonly JsonValue[]): JsonValue { return typeof args[0] === 'string' && args[0].trim().length > 0; }\n",
  );
  put(
    root,
    `packages/pure-functions/tests/${folder}/implementation.test.ts`,
    `import { expect, it } from 'vitest';\nimport { invoke } from '../../src/${folder}/implementation.js';\nit('valid and invalid working values', () => expect(invoke([null])).toBe(false));\n`,
  );
}
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('asset templates', () => {
  it('generates material and function implementations that typecheck against the real public SDK', async () => {
    const { root } = fixture();
    const project = fileURLToPath(new URL('../../', import.meta.url));
    symlinkSync(join(project, 'node_modules'), join(root, 'node_modules'));
    for (const name of ['materials-react', 'pure-functions']) {
      symlinkSync(
        join(project, 'packages', name, 'node_modules'),
        join(root, 'packages', name, 'node_modules'),
      );
    }
    put(
      root,
      'packages/pure-functions/src/types.ts',
      readFileSync(join(project, 'packages/pure-functions/src/types.ts'), 'utf8'),
    );
    await createAsset({ root, kind: 'function', id: 'text.sample' });
    await createAsset({ root, kind: 'material', id: 'sample-field' });
    const program = ts.createProgram(
      [
        join(root, 'packages/pure-functions/src/text-sample/implementation.ts'),
        join(root, 'packages/materials-react/src/sample-field/implementation.tsx'),
      ],
      {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        customConditions: ['development'],
        types: [],
        typeRoots: [join(project, 'node_modules/@types')],
      },
    );
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')),
    ).toEqual([]);
  });

  it('rejects unsupported CLI options before creating files', () => {
    const { root } = fixture();
    const cli = fileURLToPath(new URL('../../tools/engineering/assets/cli.mjs', import.meta.url));
    expect(() =>
      execFileSync(
        process.execPath,
        [
          cli,
          'new',
          'function',
          '--root',
          root,
          '--id',
          'text.sample',
          '--output',
          join(root, 'bad.json'),
        ],
        { stdio: 'pipe' },
      ),
    ).toThrow();
    expect(existsSync(join(root, 'packages/pure-functions/src/text-sample'))).toBe(false);
  });

  it('rolls back completed writes when a later edit fails and rejects concurrent mutations', async () => {
    const { root } = fixture();
    await expect(
      applyEdits(root, [
        { path: 'created', before: null, after: 'parent becomes a file' },
        { path: 'created/child', before: null, after: 'cannot be written' },
      ]),
    ).rejects.toThrow();
    expect(existsSync(join(root, 'created'))).toBe(false);
    await withWorkspaceLock(root, async () => {
      await expect(createAsset({ root, kind: 'function', id: 'text.locked' })).rejects.toThrow(
        /holds/i,
      );
    });
    expect(existsSync(join(root, '.changeset/.asset-tool.lock'))).toBe(false);
  });

  it('rolls back our writes after final verification fails while preserving concurrent edits', async () => {
    const { root } = fixture();
    put(root, 'version', 'before');
    await expect(
      applyEdits(
        root,
        [
          { path: 'version', before: 'before', after: 'after' },
          { path: 'new-log', before: null, after: 'release' },
        ],
        async () => {
          put(root, 'unrelated', 'concurrent edit');
          throw Error('Stale release plan');
        },
      ),
    ).rejects.toThrow(/Stale/);
    expect(read(root, 'version')).toBe('before');
    expect(existsSync(join(root, 'new-log'))).toBe(false);
    expect(read(root, 'unrelated')).toBe('concurrent edit');
  });

  it('previews without writes and creates both kinds with isolated manifests and mirrored tests', async () => {
    const { root } = fixture();
    const options = { root, kind: 'function', id: 'text.isNonBlank' };
    const preview = await createAsset({ ...options, dryRun: true });
    expect(preview.files).toContain('packages/pure-functions/src/text-is-non-blank/manifest.ts');
    expect(existsSync(join(root, preview.files[0]))).toBe(false);
    await createAsset(options);
    await createAsset({ root, kind: 'material', id: 'date-range' });
    expect(read(root, 'packages/pure-functions/src/index.ts')).toContain(
      'export const existing = 1',
    );
    expect(read(root, 'packages/pure-functions/src/manifests.ts')).toContain(
      'text-is-non-blank/manifest.js',
    );
    expect(read(root, 'packages/materials-react/src/date-range/manifest.ts')).not.toContain(
      'renderer-react',
    );
    expect(
      read(root, 'packages/materials-react/tests/date-range/implementation.test.tsx'),
    ).toContain('todo');
    const before = read(root, 'packages/pure-functions/src/index.ts');
    await expect(createAsset(options)).rejects.toThrow(/already exists/i);
    expect(read(root, 'packages/pure-functions/src/index.ts')).toBe(before);
  });

  it('rejects illegal IDs, core overrides and directory/name collisions without partial writes', async () => {
    const { root } = fixture();
    for (const id of ['../escape', 'core.add', 'bad/name', 'x;exec']) {
      await expect(createAsset({ root, kind: 'function', id })).rejects.toThrow();
    }
    await createAsset({ root, kind: 'function', id: 'date.isValid' });
    await expect(createAsset({ root, kind: 'function', id: 'date-is-valid' })).rejects.toThrow();
    expect(read(root, 'packages/pure-functions/src/index.ts')).not.toContain('escape');
  });

  it('rejects executable manifest expressions and unimplemented release scaffolds', async () => {
    const { root, base } = fixture();
    await createAsset({ root, kind: 'function', id: 'text.isNonBlank' });
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/declaration/i);
    await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'minor',
      summary: 'Add nonblank function',
    });
    await expect(createReleasePlan({ root, base })).rejects.toThrow(/unimplemented|unfinished/i);
    const path = 'packages/pure-functions/src/text-is-non-blank/manifest.ts';
    put(root, path, read(root, path).replace("version: '0.1.0'", 'version: process.env.VERSION'));
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/literal/i);
  });

  it('protects symlink destinations, unmanaged directories and existing public export names', async () => {
    const { root } = fixture();
    const outside = mkdtempSync(join(tmpdir(), 'form-assets-outside-'));
    roots.push(outside);
    symlinkSync(outside, join(root, 'packages/pure-functions/src/unsafe'));
    await expect(createAsset({ root, kind: 'function', id: 'unsafe' })).rejects.toThrow(/symlink/i);
    rmSync(join(root, 'packages/pure-functions/src/unsafe'));
    put(root, 'packages/pure-functions/src/custom/user-file.ts', 'owned by user');
    await expect(createAsset({ root, kind: 'function', id: 'custom' })).rejects.toThrow(/exists/i);
    put(root, 'packages/pure-functions/src/index.ts', 'export function createClash() {}\n');
    await expect(createAsset({ root, kind: 'function', id: 'clash' })).rejects.toThrow(/export/i);
    expect(existsSync(join(root, 'packages/pure-functions/src/clash/manifest.ts'))).toBe(false);
  });

  it.each([
    ['function', 'pure-functions'],
    ['material', 'materials-react'],
  ] as const)(
    'rejects existing static exports before writing %s assets',
    async (kind, directory) => {
      const { root } = fixture();
      const path = `packages/${directory}/src/manifests.ts`;
      const source = "export { manifest as sampleManifest } from './existing/manifest.js';\n";
      put(root, path, source);
      const index = read(root, `packages/${directory}/src/index.ts`);
      for (const dryRun of [true, false]) {
        await expect(createAsset({ root, kind, id: 'sample', dryRun })).rejects.toThrow(
          /Public export already exists: sampleManifest/,
        );
        expect(read(root, path)).toBe(source);
        expect(read(root, `packages/${directory}/src/index.ts`)).toBe(index);
        expect(existsSync(join(root, `packages/${directory}/src/sample`))).toBe(false);
        expect(existsSync(join(root, `packages/${directory}/tests/sample`))).toBe(false);
      }
    },
  );

  it('rejects static reexports that would execute UI or arbitrary code', async () => {
    const { root, base } = fixture();
    await createAsset({ root, kind: 'function', id: 'text.isNonBlank' });
    await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'minor',
      summary: 'Add predicate',
    });
    const path = 'packages/pure-functions/src/manifests.ts';
    put(root, path, read(root, path) + "export * from './executable.js';\n");
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/static|runtime/i);
  });
});

describe('asset and package version orchestration', () => {
  it('checks non-asset library changes and records an explicit package no-release decision', async () => {
    const { root } = fixture();
    put(
      root,
      'packages/compiler/package.json',
      JSON.stringify({ name: '@form-engine/compiler', version: '1.0.0', private: true }),
    );
    put(root, 'packages/compiler/src/index.ts', 'export const answer = 1;\n');
    const base = commit(root);
    put(
      root,
      'packages/compiler/src/index.ts',
      'export const answer = 1; // internal clarification\n',
    );
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/compiler/);
    await writeAssetChange({
      root,
      packageName: '@form-engine/compiler',
      noRelease: true,
      summary: 'Comment only, public behavior unchanged',
    });
    expect((await checkAssets({ root, base })).errors).toEqual([]);
  });

  it('requires major when a function changes its established return type', async () => {
    const { root } = fixture();
    await createAsset({ root, kind: 'function', id: 'text.isNonBlank' });
    const path = 'packages/pure-functions/src/text-is-non-blank/manifest.ts';
    put(root, path, read(root, path).replace('returns: true', "returns: { type: 'boolean' }"));
    const base = commit(root);
    put(root, path, read(root, path).replace("type: 'boolean'", "type: 'string'"));
    await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'minor',
      summary: 'Return a string',
    });
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/major/i);
  });

  it('aggregates changes, preserves first asset version, applies private package versions once and checks results', async () => {
    const { root, base } = fixture();
    await createAsset({ root, kind: 'function', id: 'text.isNonBlank' });
    implement(root);
    await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'minor',
      summary: 'Add nonblank predicate',
    });
    await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'patch',
      summary: 'Cover whitespace',
    });
    const plan = await createReleasePlan({ root, base });
    expect(plan.assets).toMatchObject([{ id: 'text.isNonBlank', from: null, to: '0.1.0' }]);
    expect(plan.packages).toMatchObject([
      { name: '@form-engine/pure-functions', oldVersion: '1.0.0', newVersion: '1.1.0' },
    ]);
    expect((await checkRelease({ root, plan })).status).toBe('ready');
    await applyReleasePlan({ root, plan });
    expect(JSON.parse(read(root, 'packages/pure-functions/package.json')).version).toBe('1.1.0');
    expect(read(root, 'packages/pure-functions/src/text-is-non-blank/manifest.ts')).toContain(
      "version: '0.1.0'",
    );
    expect(read(root, 'packages/pure-functions/CHANGELOG.md')).toContain('Add nonblank predicate');
    expect(read(root, 'packages/pure-functions/CHANGELOG.md')).not.toContain('capability-changes');
    expect((await checkRelease({ root, plan })).status).toBe('applied');
    await expect(applyReleasePlan({ root, plan })).rejects.toThrow(/already applied/i);
    expect(JSON.parse(read(root, 'packages/pure-functions/package.json')).version).toBe('1.1.0');
  });

  it('rejects stale or tampered plans before changing files or consuming declarations', async () => {
    const { root, base } = fixture();
    await createAsset({ root, kind: 'function', id: 'text.isNonBlank' });
    implement(root);
    const declaration = await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'minor',
      summary: 'Add predicate',
    });
    const plan = await createReleasePlan({ root, base });
    put(root, 'packages/pure-functions/src/_internal/new-rule.ts', 'export const threshold = 1;\n');
    await expect(applyReleasePlan({ root, plan })).rejects.toThrow(/stale/i);
    expect(existsSync(join(root, declaration.file))).toBe(true);
    expect(JSON.parse(read(root, 'packages/pure-functions/package.json')).version).toBe('1.0.0');
    const current = await createReleasePlan({ root, base });
    const tampered = structuredClone(current);
    tampered.packages[0].newVersion = '99.0.0';
    await expect(applyReleasePlan({ root, plan: tampered })).rejects.toThrow(
      /tamper|digest|invalid plan/i,
    );
    put(root, 'tests/integration/changed.test.ts', '// new acceptance case\n');
    await expect(checkRelease({ root, plan: current })).rejects.toThrow(/stale/i);
    expect(existsSync(join(root, declaration.file))).toBe(true);
  });

  it('requires major for removed ports and a new required request despite unchanged declared version', async () => {
    const { root } = fixture();
    await createAsset({ root, kind: 'material', id: 'sample' });
    const base = commit(root);
    const path = 'packages/materials-react/src/sample/manifest.ts';
    put(
      root,
      path,
      read(root, path).replace(
        'bindings: { value: { schema: true } },',
        'requests: { search: { payloadSchema: true, resultSchema: true } },',
      ),
    );
    await writeAssetChange({
      root,
      id: 'sample',
      bump: 'minor',
      summary: 'Replace binding with search',
    });
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/major/i);
  });

  it('requires explicit coverage for shared source changes and disallows no-release for contract changes', async () => {
    const { root } = fixture();
    for (const id of ['text.first', 'text.second'])
      await createAsset({ root, kind: 'function', id });
    const base = commit(root);
    put(root, 'packages/pure-functions/src/_internal/shared.ts', 'export const revised = true;\n');
    await writeAssetChange({ root, id: 'text.first', bump: 'patch', summary: 'Shared behavior' });
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/text.second/);
    await writeAssetChange({
      root,
      id: 'text.second',
      noRelease: true,
      summary: 'No observable change for this consumer',
    });
    expect((await checkAssets({ root, base })).errors).toEqual([]);
    const path = 'packages/pure-functions/src/text-second/manifest.ts';
    put(root, path, read(root, path).replace('returns: true', "returns: { type: 'boolean' }"));
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/contract|declaration/i);
  });

  it('detects missing package-level declarations for existing public code changes', async () => {
    const { root, base } = fixture();
    put(root, 'packages/pure-functions/src/index.ts', 'export const existing = 2;\n');
    expect((await checkAssets({ root, base })).errors.join('\n')).toMatch(/package.*declaration/i);
  });

  it('accepts an applied release against a baseline containing the consumed changeset', async () => {
    const { root, base } = fixture();
    await createAsset({ root, kind: 'function', id: 'text.isNonBlank' });
    implement(root);
    await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'minor',
      summary: 'Add predicate',
    });
    const pendingBase = commit(root);
    const plan = await createReleasePlan({ root, base });
    await applyReleasePlan({ root, plan });
    expect((await checkAssets({ root, base: pendingBase })).errors).toEqual([]);
  });

  it('checks an existing capability patch after its declaration was consumed', async () => {
    const { root } = fixture();
    await createAsset({ root, kind: 'function', id: 'text.isNonBlank' });
    implement(root);
    const base = commit(root);
    const path = 'packages/pure-functions/src/text-is-non-blank/implementation.ts';
    put(root, path, read(root, path).replace('length > 0', 'length >= 1'));
    await writeAssetChange({
      root,
      id: 'text.isNonBlank',
      bump: 'patch',
      summary: 'Preserve documented text behavior',
    });
    const pendingBase = commit(root);
    const plan = await createReleasePlan({ root, base });
    expect(plan.assets[0]!.to).toBe('0.1.1');
    await applyReleasePlan({ root, plan });
    expect((await checkAssets({ root, base: pendingBase })).errors).toEqual([]);
  });
});
