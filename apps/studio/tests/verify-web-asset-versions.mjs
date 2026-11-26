import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { compile } from '@form-engine/compiler';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const { port } = socket.address();
await new Promise((resolve) => socket.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  'pnpm',
  ['exec', 'next', 'dev', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    stdio: 'inherit',
    detached: true,
    env: {
      ...process.env,
      STUDIO_RETAINED_WEB_CAPABILITIES_MODULE: 'tests/fixtures/web-asset-versions.ts',
    },
  },
);
const artifact = (id, char) => ({ id, platform: 'web', digest: 'sha256:' + char.repeat(64) });
function delivery(releaseId, version, mat, fn) {
  const result = compile({
    target: { platform: 'web' },
    definition: {
      id: 'versions',
      protocolVersion: 'tests',
      version: '1',
      data: { schema: { type: 'object' } },
      views: {
        main: {
          material: 'version-result',
          props: { result: { $expr: { op: 'version.calculate', args: [] } } },
        },
      },
    },
    catalog: {
      id: version,
      materials: {
        'version-result': {
          manifest: {
            id: 'version-result',
            version,
            propsSchema: { type: 'object', properties: { result: { type: 'integer' } } },
          },
          artifact: artifact('materials-react', mat),
        },
      },
      pureFunctions: {
        'version.calculate': {
          manifest: {
            id: 'version.calculate',
            version,
            parameters: [],
            returns: { type: 'integer' },
          },
          artifact: artifact('pure-functions', fn),
        },
      },
    },
  });
  assert(result.success, JSON.stringify(result.diagnostics));
  const preparedText = JSON.stringify(result.prepared);
  return {
    releaseId,
    format: 'form-engine.release/1',
    target: { platform: 'web', profile: 'main' },
    preparedText,
    digest: 'sha256:' + createHash('sha256').update(preparedText).digest('hex'),
  };
}
let browser;
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const res = await fetch(origin + '/host', { signal: AbortSignal.timeout(3000) });
      if (res.ok) break;
    } catch {}
    if (server.exitCode !== null) throw Error('Studio exited');
    if (attempt === 59) throw Error('Studio did not start');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  for (const [id, version, mat, fn, output] of [
    ['new', '2.0.0', 'c', 'd', '2.0.0:24'],
    ['old', '1.0.0', 'a', 'b', '1.0.0:12'],
  ]) {
    await page.route('**/api/platform/releases/' + id, (route) =>
      route.fulfill({ json: delivery(id, version, mat, fn) }),
    );
    await page.goto(origin + '/host?releaseId=' + id);
    await page.locator('output', { hasText: output }).waitFor({ timeout: 15_000 });
    assert.equal(await page.locator('output').textContent(), output);
    console.log(`Verified /host?releaseId=${id} renders ${output}`);
  }
  await page.route('**/api/platform/releases/missing-artifact', (route) =>
    route.fulfill({ json: delivery('missing-artifact', '1.0.0', 'e', 'b') }),
  );
  await page.goto(origin + '/host?releaseId=missing-artifact');
  await page.getByText('缺少匹配的物料：version-result', { exact: false }).first().waitFor();
  assert.equal(await page.locator('output').count(), 0);
  console.log('Verified /host refuses a release with an unavailable artifact digest');
} finally {
  await browser?.close();
  if (server.pid && server.exitCode === null) process.kill(-server.pid, 'SIGTERM');
}
