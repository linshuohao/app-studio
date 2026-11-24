// Exercises the one-off transfer against two disposable local PostgreSQL databases.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const api = createRequire(resolve(root, 'services/api/package.json'));
const { Client } = api('pg');
const { runner } = api('node-pg-migrate');
const local = resolve(root, 'services/api/.env.test.local');
const adminUrl =
  process.env.PLATFORM_TEST_DATABASE_URL ??
  (existsSync(local) && parseEnv(readFileSync(local, 'utf8')).PLATFORM_TEST_DATABASE_URL);
if (!adminUrl) throw Error('Configure a disposable PostgreSQL administrator database');
const admin = new Client({ connectionString: adminUrl });
const created = [];
async function database() {
  const name = 'ownership_test_' + randomUUID().replaceAll('-', '');
  await admin.query('CREATE DATABASE "' + name + '"');
  created.push(name);
  const url = new URL(adminUrl);
  url.pathname = '/' + name;
  return url.toString();
}
async function run(cmd, args, cwd, env) {
  const proc = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: 'inherit' });
  const [code] = await once(proc, 'close');
  assert.equal(code, 0);
}
await admin.connect();
const role = 'ownership_reader_' + randomUUID().replaceAll('-', '');
let createdRole = false;
let db;
try {
  const platformUrl = await database(),
    agentUrl = await database();
  const ops = {
    databaseUrl: platformUrl,
    dir: resolve(root, 'services/api/migrations'),
    migrationsTable: 'platform_schema_migrations',
    direction: 'up',
    log: () => {},
  };
  await runner({ ...ops, count: 5, singleTransaction: true });
  db = new Client({ connectionString: platformUrl });
  await db.connect();
  const candidate = '{"title":"候选"}',
    working = ' { "title": "用户自己的工作稿" } ';
  const hash = (s) => 'sha256:' + createHash('sha256').update(s).digest('hex');
  const cid = randomUUID(),
    chat = randomUUID();
  await db.query(
    "INSERT INTO platform_spaces VALUES ('space'); INSERT INTO platform_users VALUES ('member',1)",
  );
  await db.query(
    `INSERT INTO platform_creation_sessions (id,user_id,space_id,document,turns,revision)
  VALUES ($1,'member','space','问答',$2,1)`,
    [chat, JSON.stringify([{ message: '问答', result: { kind: 'answer', message: '回答' } }])],
  );
  await db.query(
    `INSERT INTO platform_creation_sessions (id,user_id,space_id,document,turns,revision,draft_text,draft_checkpoint,draft_applied,draft_name,draft_version_name,preview_digest)
  VALUES ($1,'member','space','创建表单',$2,2,$3,7,1,'当前手改名','初稿', $4)`,
    [
      cid,
      JSON.stringify([
        {
          message: '创建表单',
          result: {
            kind: 'proposal',
            summary: '生成候选',
            candidate_text: candidate,
            check: {
              success: true,
              check_id: 'fixture-check',
              candidate_digest: hash(candidate),
              diagnostics: [],
            },
          },
        },
        { message: '为什么？', result: { kind: 'answer', message: '这是之前的候选。' } },
      ]),
      working,
      hash(working),
    ],
  );
  const saved = randomUUID(),
    form = randomUUID(),
    version = randomUUID(),
    empty = randomUUID();
  const original = '未提交的首轮原文'.repeat(48);
  await db.query(
    "INSERT INTO platform_forms(form_id,space_id,name,created_by,created_at) VALUES ($1,'space','已保存','member','2026-11-23')",
    [form],
  );
  await db.query(
    "INSERT INTO platform_versions(version_id,form_id,text,saved_by,saved_at) VALUES ($1,$2,convert_to($3,'UTF8'),'member','2026-11-23')",
    [version, form, working],
  );
  await db.query(
    `INSERT INTO platform_creation_sessions(id,user_id,space_id,document,turns,revision,draft_text,draft_applied,form_id,version_id)
    SELECT $1,user_id,space_id,document,turns,revision,draft_text,draft_applied,$2,$3 FROM platform_creation_sessions WHERE id=$4`,
    [saved, form, version, cid],
  );
  await db.query(
    "INSERT INTO platform_creation_sessions(id,user_id,space_id,document) VALUES ($1,'member','space',$2)",
    [empty, original],
  );
  await admin.query('CREATE ROLE "' + role + '" NOLOGIN');
  createdRole = true;
  await db.query('GRANT SELECT, UPDATE ON platform_creation_sessions TO "' + role + '"');
  await assert.rejects(
    runner({ ...ops, singleTransaction: true }),
    /Import and verify every Agent conversation/,
  );
  const agentDir = resolve(root, 'services/agent');
  await run(resolve(agentDir, '.venv/bin/alembic'), ['upgrade', 'head'], agentDir, {
    AGENT_DATABASE_URL: agentUrl,
  });
  const script = resolve(root, 'tools/engineering/migrations/split-agent-conversations.mjs');
  const env = { PLATFORM_MIGRATION_DATABASE_URL: platformUrl, AGENT_DATABASE_URL: agentUrl };
  await run(process.execPath, [script], root, env);
  await run(process.execPath, [script], root, env);
  const result = await db.query('SELECT * FROM platform_form_drafts');
  assert.equal(result.rowCount, 2);
  const savedDraft = result.rows.find((r) => r.id === saved);
  assert.equal(savedDraft.form_id, form);
  assert.equal(savedDraft.version_id, version);
  const grants = await db.query(
    "SELECT has_table_privilege($1,'platform_form_drafts','UPDATE') AS edit, has_table_privilege($1,'platform_draft_deliveries','SELECT') AS read, has_table_privilege($1,'platform_form_drafts','DELETE') AS discard",
    [role],
  );
  assert.deepEqual(grants.rows[0], { edit: true, read: true, discard: false });
  assert.equal(
    (await db.query('SELECT count(*)::int n FROM platform_draft_deliveries')).rows[0].n,
    2,
  );
  const draft = result.rows.find((r) => r.id === cid);
  assert.equal(draft.id, cid);
  assert.equal(draft.working_text, working);
  assert.equal(draft.candidate_text, candidate);
  assert.equal(draft.preview_digest, hash(working));
  assert.equal(draft.name, '当前手改名');
  assert.equal(draft.revision, 7);
  assert.equal(
    (await db.query("SELECT to_regclass('platform_creation_sessions') AS name")).rows[0].name,
    null,
  );
  const agentDb = new Client({ connectionString: agentUrl });
  await agentDb.connect();
  try {
    assert.equal((await agentDb.query('SELECT id FROM agent_conversations')).rowCount, 4);
    assert.equal(
      (await agentDb.query('SELECT conversation_id FROM agent_conversation_turns')).rowCount,
      5,
    );
    const migrated = await agentDb.query(
      'SELECT form_id,work_id FROM agent_conversations WHERE id=$1',
      [saved],
    );
    assert.deepEqual(migrated.rows[0], { form_id: form, work_id: version });
    const replay = await agentDb.query(
      'SELECT request FROM agent_conversation_turns WHERE conversation_id=$1',
      [chat],
    );
    // Use the same ordered, UTF-8 JSON input as the API gateway for a migrated command.
    const command = replay.rows[0].request;
    assert.equal(
      command.requestFingerprint,
      hash(
        JSON.stringify([
          command.revision,
          command.message,
          command.document,
          command.draftId,
          command.draftRevision,
          command.formId,
          command.workId,
          command.workingText,
        ]),
      ),
    );
    const pending = await agentDb.query(
      'SELECT to_jsonb(s)::text AS snapshot,revision FROM agent_conversations s WHERE id=$1',
      [empty],
    );
    assert.equal(pending.rows[0].revision, 0);
    assert(pending.rows[0].snapshot.includes(original));
    await agentDb.query('DELETE FROM agent_conversations WHERE id=$1', [cid]);
    assert.equal(
      (
        await agentDb.query('SELECT 1 FROM agent_conversation_turns WHERE conversation_id=$1', [
          cid,
        ])
      ).rowCount,
      0,
    );
    assert.equal(
      (await db.query('SELECT working_text FROM platform_form_drafts WHERE id=$1', [cid])).rows[0]
        .working_text,
      working,
    );
  } finally {
    await agentDb.end();
  }
  console.log(
    'Verified full transfer, guard, repeat invocation, edited bytes, preview identity and independent deletion.',
  );
} finally {
  await db?.end();
  for (const name of created.reverse())
    await admin.query('DROP DATABASE "' + name + '" WITH (FORCE)');
  if (createdRole) await admin.query('DROP ROLE "' + role + '"');
  await admin.end();
}
