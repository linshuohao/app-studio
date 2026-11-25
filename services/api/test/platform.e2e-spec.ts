import { Test } from '@nestjs/testing';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import request from 'supertest';
import { expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PlatformDatabase } from '../src/platform/database.js';
import { PlatformForms } from '../src/platform/forms.js';
async function freePort(): Promise<number> {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No TCP port');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}
async function stop(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  child.kill();
  await exited;
}
it('persists sessions, exact config and idempotent results across API processes', async () => {
  const port = await freePort();
  const origin = 'http://127.0.0.1:3200';
  const api = request(`http://127.0.0.1:${port}`);
  const env = {
    ...process.env,
    API_PORT: String(port),
    HOST: '127.0.0.1',
    PLATFORM_STUDIO_ORIGIN: origin,
  };
  let server: ChildProcess | undefined;
  let logs = '';
  async function start() {
    server = spawn(process.execPath, ['--import', './dev-loader.mjs', 'src/main.ts'], { env });
    server.stderr?.on('data', (chunk) => {
      logs += String(chunk);
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) break;
      if (
        await api.get('/').then(
          (res) => res.status === 200,
          () => false,
        )
      )
        return;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    throw new Error(`API did not start: ${logs}`);
  }
  async function bootstrap() {
    const child = spawn(
      process.execPath,
      ['--import', './dev-loader.mjs', 'src/platform/bootstrap.ts', 'admin'],
      { env },
    );
    child.stdin.end('a-local-test-password\n');
    const [code] = await once(child, 'exit');
    return code;
  }
  try {
    await start();
    await api.get('/api/platform/forms').expect(401);
    expect((await Promise.all([bootstrap(), bootstrap()])).sort()).toEqual([0, 1]);
    const login = () => api.post('/api/platform/login').set('Origin', origin);
    await login().send({ username: 'admin', password: 'incorrect' }).expect(401);
    const credentials = { username: 'admin', password: 'a-local-test-password' };
    await api
      .post('/api/platform/login')
      .set('Origin', 'https://other.test')
      .send(credentials)
      .expect(403);
    async function signIn() {
      const response = await login().send(credentials).expect(200);
      const cookie = response.headers['set-cookie']?.[0]?.split(';')[0];
      if (!cookie) throw new Error('Expected a session cookie');
      return cookie;
    }
    const session = await signIn();
    const second = await signIn();
    const read = (path: string) => api.get(`/api/platform${path}`).set('Cookie', session);
    const write = (path: string, key: string) =>
      api
        .post(`/api/platform${path}`)
        .set('Origin', origin)
        .set('Cookie', session)
        .set('Idempotency-Key', key);
    const context = (await read('/access').expect(200)).body;
    expect(context.permissions).toContain('form:edit');
    const create = () => write('/forms', 'create-1').send({ name: 'Example' }).expect(201);
    const [created, repeated] = await Promise.all([create(), create()]);
    expect(created.body).toEqual(repeated.body);
    const { formId } = created.body;
    const formPath = `/forms/${formId}`;
    expect((await read(formPath).expect(200)).body.version).toBeNull();
    expect((await read('/forms').expect(200)).body).toHaveLength(1);
    const raw = ' {\n  "中文": \u0000\n';
    const save = (key: string, text: string, basedOnVersionId?: string) =>
      write(`${formPath}/versions`, key).send({ text, basedOnVersionId });
    const [first, replay] = await Promise.all([
      save('first', raw).expect(201),
      save('first', raw).expect(201),
    ]);
    expect(first.body).toEqual(replay.body);
    await save('first', 'changed').expect(409);
    expect((await read(formPath).expect(200)).body.version.text).toBe(raw);
    const storage = new PlatformDatabase();
    const db = storage.executor;
    try {
      await db.execute(
        `CREATE FUNCTION reject_receipt_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.request_key = 'failure' THEN RAISE EXCEPTION 'fault injected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_receipt BEFORE INSERT ON platform_receipts FOR EACH ROW EXECUTE FUNCTION reject_receipt_fn()`,
      );
      await save('failure', raw).expect(500);
      expect((await db.one('SELECT count(*) AS count FROM platform_versions', []))?.count).toBe(1);
      expect(
        await db.one("SELECT 1 FROM platform_receipts WHERE request_key = 'failure'", []),
      ).toBeUndefined();
      await db.execute('DROP TRIGGER reject_receipt ON platform_receipts');
      const basedOn = first.body.versionId;
      const [left, right] = await Promise.all([
        save('left', raw, basedOn).expect(201),
        save('right', raw, basedOn).expect(201),
      ]);
      expect(new Set([basedOn, left.body.versionId, right.body.versionId]).size).toBe(3);
      const latest = (await read(formPath).expect(200)).body.version;
      expect(latest.versionId).toBe(
        (
          await db.one(
            'SELECT version_id FROM platform_versions ORDER BY sequence DESC LIMIT 1',
            [],
          )
        )?.version_id,
      );
      expect(latest.text).toBe(raw);
      const other = (await write('/forms', 'other').send({ name: 'Other' }).expect(201)).body
        .formId;
      await api
        .post(`/api/platform/forms/${other}/versions`)
        .set('Origin', origin)
        .set('Cookie', session)
        .set('Idempotency-Key', 'bad-source')
        .send({ text: raw, basedOnVersionId: basedOn })
        .expect(400);
      await save('oversize', 'a'.repeat(64 * 1024 + 1)).expect(400);
      await db.execute("INSERT INTO platform_spaces (space_id) VALUES ('other')", []);
      await db.execute("UPDATE platform_forms SET space_id = 'other' WHERE form_id = $1", [other]);
      await read(`/forms/${other}`).expect(404);
      await write(`/forms/${other}/versions`, 'other-space').send({ text: raw }).expect(404);
      await db.execute('UPDATE platform_forms SET archived = 1 WHERE form_id = $1', [formId]);
      await save('archived', raw).expect(409);
      await db.execute('UPDATE platform_forms SET archived = 0 WHERE form_id = $1', [formId]);
      await db.execute("UPDATE platform_member_roles SET role = 'viewer'");
      await read(formPath).expect(200);
      await save('first', raw).expect(403);
      await write('/forms', 'new').send({ name: 'No' }).expect(403);
      await db.execute('UPDATE platform_members SET active = 0');
      await read('/forms').expect(403);
      await db.execute(
        "UPDATE platform_members SET active = 1; UPDATE platform_member_roles SET role = 'admin'",
      );
      await api
        .post('/api/platform/logout')
        .set('Origin', origin)
        .set('Cookie', second)
        .expect(204);
      await api.get('/api/platform/forms').set('Cookie', second).expect(401);
      await stop(server);
      await start();
      await api.get('/api/platform/forms').set('Cookie', second).expect(401);
      expect((await read(formPath).expect(200)).body.version).toEqual(latest);
      expect((await save('first', raw).expect(201)).body).toEqual(first.body);
      expect((await db.one('SELECT count(*) AS count FROM platform_versions', []))?.count).toBe(3);
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PlatformDatabase)
        .useValue({ executor: db })
        .compile();
      try {
        const forms = module.get(PlatformForms);
        expect((await forms.readVersion(context.spaceId, formId, basedOn)).text).toBe(raw);
        await expect(forms.readVersion(context.spaceId, other, basedOn)).rejects.toThrow();
      } finally {
        await module.close();
      }
      await save('failure', raw).expect(201);
      expect((await db.one('SELECT count(*) AS count FROM platform_versions', []))?.count).toBe(4);
    } finally {
      await storage.onModuleDestroy();
    }
  } finally {
    await stop(server);
  }
}, 30000);
