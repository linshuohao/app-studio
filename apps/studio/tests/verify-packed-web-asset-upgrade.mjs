import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { prepareRetainedWebAssets } from '../../../tools/engineering/prepare-retained-web-assets.mjs';
import { buildIdentity } from '../../../services/api/src/platform/build-identity.ts';
import { createTestDatabase } from '../../../services/api/tools/test-database.mjs';

// Run in a disposable checkout. Test variants are compiled from the real sources,
// and the original sources/builds are restored on exit.
assert.equal(process.env.WEB_ASSET_UPGRADE_ISOLATED, '1', 'Use a disposable checkout');
const root = fileURLToPath(new URL('../../..', import.meta.url));
const studio = join(root, 'apps/studio');
const apiDir = join(root, 'services/api');
const archive = await mkdtemp(join(studio, 'tests/packed-upgrade-'));
const retain = ['materials-react', 'pure-functions', 'runtime'];
const originals = new Map();
const db = await createTestDatabase();
let api, site, browser;
const secret = 'isolated-web-upgrade-password';
const start = (cwd, cmd, args, env = {}) =>
  spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
async function run(cwd, cmd, args, env, input) {
  const child = start(cwd, cmd, args, env);
  child.stdin.end(input);
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, args.join(' '));
}
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  process.kill(-child.pid, 'SIGTERM');
  await done;
}
async function address() {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  await new Promise((close) => socket.close(close));
  return { port, url: 'http://127.0.0.1:' + port };
}
async function waitFor(url, child) {
  for (let i = 0; i < 70; i++) {
    if (child.exitCode !== null) throw new Error('Process exited: ' + url);
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(2_000) })).ok) return;
    } catch {}
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Timed out: ' + url);
}
const apiAddress = await address();
const siteAddress = await address();
const env = {
  API_PORT: String(apiAddress.port),
  HOST: '127.0.0.1',
  PLATFORM_DATABASE_URL: db.connectionString,
  PLATFORM_STUDIO_ORIGIN: siteAddress.url,
  PLATFORM_WEB_ASSET_VERSION_SELECTION: 'true',
};
async function startApi(extra = {}) {
  api = start(apiDir, process.execPath, ['--import', './dev-loader.mjs', 'src/main.ts'], {
    ...env,
    ...extra,
  });
  await waitFor(apiAddress.url, api);
}
let cookie;
async function call(path, body, expected = 200) {
  const response = await fetch(apiAddress.url + '/api/platform' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: siteAddress.url,
      'Idempotency-Key': randomUUID(),
      ...(cookie && { Cookie: cookie }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, JSON.stringify(data));
  if (path === '/login') cookie = response.headers.getSetCookie()[0].split(';')[0];
  return data;
}
const definition = JSON.stringify({
  id: 'packed-upgrade',
  protocolVersion: '1',
  version: '1',
  data: { schema: { type: 'object', properties: { customer: { type: 'string' } } } },
  views: {
    main: {
      material: 'section',
      props: { title: '真实制品' },
      slots: {
        default: [
          {
            material: 'field',
            props: { label: '客户姓名', help: '输入真实姓名' },
            slots: {
              default: [
                {
                  material: 'text-input',
                  bindings: { value: { source: 'data', path: '/customer' } },
                },
              ],
            },
          },
          {
            material: 'value-display',
            props: {
              format: 'integer',
              value: {
                $expr: {
                  op: 'date.inclusiveDays',
                  args: ['2026-11-20', '2026-11-22'],
                },
              },
            },
          },
          {
            material: 'value-display',
            props: { format: 'integer', value: { $expr: { op: 'core.add', args: [10, 20] } } },
          },
        ],
      },
    },
  },
});
async function createForm(name) {
  const { formId } = await call('/forms', { name }, 201);
  const { versionId } = await call('/forms/' + formId + '/versions', { text: definition }, 201);
  const published = await call(
    '/forms/' + formId + '/releases',
    { versionId, profile: 'main' },
    201,
  );
  assert(published.success, JSON.stringify(published.diagnostics));
  return { formId, versionId, ...published };
}
async function patch(path, from, to) {
  const file = join(root, path);
  const source = await readFile(file, 'utf8');
  assert(source.includes(from), path);
  originals.set(file, source);
  await writeFile(file, source.replace(from, to));
}
const rebuild = () =>
  run(root, 'pnpm', [
    '--filter',
    '@form-engine/materials-react',
    '--filter',
    '@form-engine/pure-functions',
    'build',
  ]);

try {
  for (const name of retain) {
    const source = join(root, 'packages', name);
    const target = join(archive, name);
    await mkdir(target);
    await cp(join(source, 'package.json'), join(target, 'package.json'));
    await cp(join(source, 'dist'), join(target, 'dist'), { recursive: true });
  }
  // The archived Runtime resolves the exact archived module that owns its reserved core bindings.
  // All material implementations share the current, ABI-compatible React renderer adapter.
  for (const name of ['runtime', 'materials-react']) {
    const target = join(archive, name, 'node_modules');
    await mkdir(join(target, '@form-engine'), { recursive: true });
    const dependencies = JSON.parse(
      await readFile(join(root, 'packages', name, 'package.json'), 'utf8'),
    ).dependencies;
    for (const dependency of Object.keys(dependencies ?? {})) {
      const link = join(target, dependency);
      await mkdir(dirname(link), { recursive: true });
      await symlink(
        dependency === '@form-engine/pure-functions'
          ? join(archive, 'pure-functions')
          : join(root, 'packages', name, 'node_modules', dependency),
        link,
      );
    }
  }
  const mat = buildIdentity(join(archive, 'materials-react/package.json'), 'materials-react');
  const fn = buildIdentity(join(archive, 'pure-functions/package.json'), 'pure-functions');
  const engine = buildIdentity(join(archive, 'runtime/package.json'), 'runtime');
  const catalogs = join(archive, 'catalogs.json');
  const registrationFile = join(archive, 'registration.mjs');
  await run(
    apiDir,
    process.execPath,
    ['--import', './dev-loader.mjs', 'src/platform/bootstrap.ts', 'upgrade-admin'],
    env,
    secret + '\n',
  );
  await startApi();
  await call('/login', { username: 'upgrade-admin', password: secret });
  const old = await createForm('旧制品表单');
  const before = await call('/releases/' + old.releaseId);
  assert.equal(
    JSON.parse(before.preparedText).capabilityLock.materials.field.artifact.digest,
    mat.digest,
  );
  await stop(api);
  await patch(
    'packages/materials-react/src/text-input/implementation.tsx',
    'placeholder={p.placeholder}',
    'placeholder={p.placeholder ?? "新版输入"}',
  );
  await patch(
    'packages/pure-functions/src/date-inclusive-days/implementation.ts',
    'return inclusiveDays(args[0], args[1]);',
    'const days = inclusiveDays(args[0], args[1]);\n  return days === null ? null : days + 1;',
  );
  for (const file of [
    'packages/materials-react/src/text-input/manifest.ts',
    'packages/pure-functions/src/date-inclusive-days/manifest.ts',
  ]) {
    const source = await readFile(join(root, file), 'utf8');
    const version = /version: '([^']+)'/.exec(source)[0];
    await patch(file, version, "version: '99.0.0'");
  }
  await rebuild();
  await prepareRetainedWebAssets({
    archives: [
      {
        materialsRoot: join(archive, 'materials-react'),
        functionsRoot: join(archive, 'pure-functions'),
        runtimeRoot: join(archive, 'runtime'),
        materialsDigest: mat.digest,
        functionsDigest: fn.digest,
        runtimeDigest: engine.digest,
      },
    ],
    currentMaterialsRoot: join(root, 'packages', 'materials-react'),
    catalogsFile: catalogs,
    moduleFile: registrationFile,
  });
  await startApi({ PLATFORM_RETAINED_WEB_CATALOGS_FILE: catalogs });
  const current = await createForm('新制品表单');
  const installed = await call('/releases/' + current.releaseId);
  assert.notEqual(
    JSON.parse(installed.preparedText).capabilityLock.materials.field.artifact.digest,
    mat.digest,
  );
  assert.deepEqual(await call('/releases/' + old.releaseId), before);
  const oldChecked = await call('/forms/' + old.formId + '/preview', {
    versionId: old.versionId,
    profile: 'main',
  });
  assert.equal(
    oldChecked.prepared.capabilityLock.pureFunctions['core.add'].artifact.digest,
    fn.digest,
  );

  const oldRepublished = await call(
    '/forms/' + old.formId + '/releases',
    { versionId: old.versionId, profile: 'main' },
    201,
  );
  assert(oldRepublished.success, JSON.stringify(oldRepublished.diagnostics));
  const oldRepublishedDelivery = await call('/releases/' + oldRepublished.releaseId);
  assert.deepEqual(
    JSON.parse(oldRepublishedDelivery.preparedText).capabilityLock,
    JSON.parse(before.preparedText).capabilityLock,
  );
  site = start(
    studio,
    'pnpm',
    ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(siteAddress.port)],
    {
      PLATFORM_API_URL: apiAddress.url,
      STUDIO_RETAINED_WEB_CAPABILITIES_MODULE: relative(studio, registrationFile),
    },
  );
  await waitFor(siteAddress.url + '/host', site);
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error));
  page.on('console', (message) => {
    if (message.type() === 'error') console.error(message.text());
  });
  for (const [release, value, placeholder] of [
    [old, '3', null],
    [current, '4', '新版输入'],
  ]) {
    await page.goto(siteAddress.url + '/host?releaseId=' + release.releaseId);
    const input = page.getByRole('textbox', { name: '客户姓名' });
    try {
      await input.waitFor({ timeout: 10_000 });
    } catch (error) {
      console.error('Host did not render', await page.locator('body').innerText());
      throw error;
    }
    await input.fill('Samuel');
    assert.equal(await input.inputValue(), 'Samuel');
    assert.equal((await input.getAttribute('aria-describedby')) !== null, true);
    assert.equal(await input.getAttribute('placeholder'), placeholder);
    await page.getByText(value, { exact: true }).waitFor();
    const displayed = await page.locator('.fe-value').allTextContents();
    assert(
      displayed.includes('30'),
      JSON.stringify({
        release: release.releaseId,
        displayed,
        diagnostics: await page.locator('[role=alert]').allTextContents(),
      }),
    );
    console.log('Verified packed Web release', release.releaseId, value);
  }
  const { id: work } = await call(
    '/forms/' + old.formId + '/work',
    { name: '升级工作版本', source: old.versionId },
    201,
  );
  await page.context().addCookies([
    {
      name: 'platform-session',
      value: cookie.slice('platform-session='.length),
      url: siteAddress.url,
    },
  ]);
  await page.goto(siteAddress.url + '/?form=' + old.formId + '&work=' + work);
  await page.getByRole('button', { name: '资产版本', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Web 资产版本' });
  await dialog.getByText('text-input', { exact: true }).waitFor();
  for (const id of ['field', 'text-input', 'date.inclusiveDays']) {
    await dialog.getByRole('combobox', { name: 'main · ' + id + ' 版本', exact: true }).click();
    await page.getByRole('option', { name: /推荐/ }).click();
  }
  await page.keyboard.press('Escape');
  const savedResponse = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && r.url().endsWith('/forms/' + old.formId + '/versions'),
  );
  await page.getByRole('button', { name: '保存配置', exact: true }).click();
  const saved = await (await savedResponse).json();
  assert(saved.versionId, JSON.stringify(saved));
  const upgraded = await call('/forms/' + old.formId + '/preview', {
    versionId: saved.versionId,
    profile: 'main',
  });
  assert.equal(upgraded.prepared.capabilityLock.materials['text-input'].version, '99.0.0');
  assert.equal(
    upgraded.prepared.capabilityLock.pureFunctions['date.inclusiveDays'].version,
    '99.0.0',
  );
  console.log('Verified Studio upgrade creates an independent revision', saved.versionId);
} finally {
  await browser?.close();
  await stop(site);
  await stop(api);
  for (const [file, source] of originals) await writeFile(file, source);
  try {
    if (originals.size) await rebuild();
  } finally {
    await db.dispose();
    await rm(archive, { recursive: true, force: true });
  }
}
