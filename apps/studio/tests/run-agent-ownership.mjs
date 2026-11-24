// pnpm --filter @form-engine/studio exec node tests/run-agent-ownership.mjs [--live] [--promotion]
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createTestDatabase } from '../../../services/api/tools/test-database.mjs';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(join(root, 'services/api/package.json'));
const { Client } = require('pg');
const live = process.argv.includes('--live');
const promotion = process.argv.includes('--promotion');
assert(process.argv.slice(2).every((a) => ['--live', '--promotion'].includes(a)));
const processes = [];
const reserved = await Promise.all(
  Array.from({ length: 3 }, async () => {
    const server = createServer().listen(0, '127.0.0.1');
    await once(server, 'listening');
    return server;
  }),
);
const [apiPort, agentPort, studioPort] = reserved.map((s) => s.address().port);
await Promise.all(reserved.map((s) => new Promise((r) => s.close(r))));
const api = 'http://127.0.0.1:' + apiPort,
  agent = 'http://127.0.0.1:' + agentPort,
  studio = 'http://127.0.0.1:' + studioPort;
const platformDb = await createTestDatabase();
const isolatedName = 'agent_studio_test_' + randomUUID().replaceAll('-', '');
const admin = new Client({ connectionString: platformDb.connectionString });
const url = new URL(platformDb.connectionString);
url.pathname = '/' + isolatedName;
const env = {
  ...process.env,
  AGENT_DATABASE_URL: url.toString(),
  PLATFORM_DATABASE_URL: platformDb.connectionString,
  PLATFORM_STUDIO_ORIGIN: studio,
  CREATE_FORM_PLATFORM_URL: api,
  CREATE_FORM_AGENT_URL: agent,
  AGENT_SERVICE_TOKEN: randomUUID(),
};
function start(command, args, cwd, extra) {
  const child = spawn(command, args, {
    cwd: join(root, cwd),
    env: { ...env, ...extra },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  child.stdout.on('data', () => {});
  processes.push(child);
}
async function ready(address) {
  for (let i = 0; i < 120; i++) {
    try {
      await fetch(address);
      return;
    } catch {}
    if (processes.some((p) => p.exitCode !== null))
      throw Error('An isolated service failed to start.');
    await delay(500);
  }
  throw Error('Timed out waiting for ' + address);
}
let created = false;
try {
  await admin.connect();
  await admin.query('CREATE DATABASE "' + isolatedName + '"');
  created = true;
  for (const args of [
    ['-m', 'alembic', 'upgrade', 'head'],
    [
      '-m',
      'form_agent.publish_protocol',
      'createform-l1-2026-11-22.2',
      'knowledge/createform-l1-2026-11-22.2.md',
    ],
  ]) {
    const prep = spawnSync('.venv/bin/python', args, {
      cwd: join(root, 'services/agent'),
      env,
      stdio: 'inherit',
    });
    assert.equal(prep.status, 0);
  }
  start(process.execPath, ['--import', './dev-loader.mjs', 'src/main.ts'], 'services/api', {
    NODE_ENV: 'development',
    PLATFORM_LOCAL_LOGIN: 'true',
    HOST: '127.0.0.1',
    API_PORT: String(apiPort),
  });
  const factory = live ? 'form_agent.dev:create_dev_app' : 'ownership_model:app';
  start(
    '.venv/bin/python',
    [
      '-m',
      'uvicorn',
      factory,
      '--factory',
      '--app-dir',
      join(root, 'apps/studio/tests'),
      '--host',
      '127.0.0.1',
      '--port',
      String(agentPort),
    ],
    'services/agent',
    live ? {} : { CREATE_FORM_MODEL: 'scripted-browser-fixture' },
  );
  start(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(studioPort),
    ],
    'apps/studio',
    {
      STUDIO_DIST_DIR: process.env.STUDIO_DIST_DIR || '.next/studio-canvas',
      PLATFORM_API_URL: api,
      NEXT_TELEMETRY_DISABLED: '1',
    },
  );
  await Promise.all([ready(api), ready(agent + '/health'), ready(studio)]);
  const health = await (await fetch(agent + '/health')).json();
  assert(health.create_form_ready, 'Configure the local model before running live acceptance.');
  const test = spawn(process.execPath, ['tests/verify-agent-turn.mjs'], {
    cwd: join(root, 'apps/studio'),
    env: { ...env, CREATE_FORM_STUDIO_URL: studio, STUDIO_TEST_PROMOTION: promotion ? '1' : '0' },
    stdio: 'inherit',
  });
  const [status] = await once(test, 'exit');
  assert.equal(status, 0);
} finally {
  await Promise.all(
    processes.map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = once(child, 'close');
      process.kill(-child.pid, 'SIGTERM');
      await closed;
    }),
  );
  if (created) await admin.query('DROP DATABASE "' + isolatedName + '" WITH (FORCE)');
  await admin.end();
  await platformDb.dispose();
}
