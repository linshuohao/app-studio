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
    import { getEngineeringLabel } from '@form-engine/runtime/engineering';
    import { EngineeringPanel } from '@form-engine/renderer-react/engineering';
    import { EngineeringInput } from '@form-engine/materials-react/engineering';
    assert.equal(inspectEngineeringMarker(), 'form-engine-workspace');
    assert.match(getEngineeringLabel(), /form-engine-workspace/);
    const markup = renderToStaticMarkup(createElement(EngineeringPanel, null, createElement(EngineeringInput, { 'aria-label': 'sample' })));
    assert.match(markup, /fe-engineering-input/);
    const css = readFileSync(new URL(import.meta.resolve('@form-engine/materials-react/styles.css')), 'utf8');
    assert.match(css, /fe-engineering-input/);
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
    `import { inspectEngineeringMarker } from '@form-engine/compiler/engineering';\nimport { EngineeringInput } from '@form-engine/materials-react/engineering';\nimport { EngineeringPanel } from '@form-engine/renderer-react/engineering';\nimport type { ComponentProps } from 'react';\nconst marker: string = inspectEngineeringMarker();\nconst input: ComponentProps<typeof EngineeringInput> = { value: marker };\nconst panel: ComponentProps<typeof EngineeringPanel> = { children: marker };\nexport { marker, input, panel };\n`,
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
