// One-time ownership cutover. Invoke with both owners' migration credentials.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const api = createRequire(new URL('../../../services/api/package.json', import.meta.url));
const { Client } = api('pg');
const { runner } = api('node-pg-migrate');
const agentDir = fileURLToPath(new URL('../../../services/agent/', import.meta.url));
const migrationDir = fileURLToPath(new URL('../../../services/api/migrations/', import.meta.url));
const agentPython = process.env.AGENT_PYTHON || resolve(agentDir, '.venv/bin/python');
const platformUrl = process.env.PLATFORM_MIGRATION_DATABASE_URL;
const agentUrl = process.env.AGENT_DATABASE_URL;
if (!platformUrl || !agentUrl) throw Error('Both migration databases must be configured');

async function importRows(rows, verify) {
  const args = ['-m', 'form_agent.import_conversations', ...(verify ? ['--verify'] : [])];
  const child = spawn(agentPython, args, {
    cwd: agentDir,
    env: { PATH: process.env.PATH, AGENT_DATABASE_URL: agentUrl, PYTHONUTF8: '1' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => {
    output += chunk;
  });
  const [[status]] = await Promise.all([
    once(child, 'close'),
    pipeline(Readable.from(rows.map((row) => row.source + '\n')), child.stdin),
  ]);
  if (status !== 0) throw Error('Agent ' + (verify ? 'verification' : 'import') + ' failed');
  const receipts = output
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  if (receipts.length !== rows.length) throw Error('Missing Agent receipts');
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const receipt = receipts[index];
    if (
      receipt.id !== row.id ||
      receipt.publicTurns !== row.count ||
      receipt.revision !== row.revision ||
      typeof receipt.sourceDigest !== 'string' ||
      !receipt.sourceDigest.length
    )
      throw Error('Agent receipt does not match the source conversation');
  }
  return receipts;
}

async function holdAgentCutover() {
  // The owner process holds its database lock until Platform has committed or rolled back.
  const child = spawn(agentPython, ['-m', 'form_agent.import_conversations', '--hold-cutover'], {
    cwd: agentDir,
    env: { PATH: process.env.PATH, AGENT_DATABASE_URL: agentUrl, PYTHONUTF8: '1' },
    stdio: ['pipe', 'pipe', 'inherit'],
  });
  const closed = once(child, 'close');
  const reader = createInterface({ input: child.stdout });
  try {
    const first = await reader[Symbol.asyncIterator]().next();
    if (first.done || first.value !== 'READY') throw Error('Agent migration lock unavailable');
  } catch (error) {
    child.stdin.end();
    await closed;
    throw error;
  } finally {
    reader.close();
  }
  return {
    assertHeld() {
      if (child.exitCode !== null || child.signalCode !== null || child.stdout.readableEnded)
        throw Error('Agent migration lock lost');
    },
    async release() {
      child.stdin.end();
      const [status] = await closed;
      if (status !== 0) throw Error('Agent migration lock process failed');
    },
  };
}

const db = new Client({ connectionString: platformUrl });
await db.connect();
let agentLock;
try {
  agentLock = await holdAgentCutover();
  await db.query('BEGIN');
  // Coordinate with all existing Platform mutation transactions before reading the source.
  await db.query('SELECT pg_advisory_xact_lock(17017, 1)');
  const status = await db.query(
    "SELECT to_regclass('platform_creation_sessions') AS source, to_regclass('platform_form_drafts') AS drafts",
  );
  if (!status.rows[0].source) {
    if (!status.rows[0].drafts)
      throw Error('Platform source and destination relations are both missing');
    await db.query('COMMIT');
    console.log('Platform ownership cutover already applied.');
  } else {
    const baseline = await db.query('SELECT name FROM platform_schema_migrations ORDER BY id');
    if (baseline.rowCount !== 5 || baseline.rows.at(-1).name !== '1780000000004-agent-drafts')
      throw Error('Apply the preceding Platform migrations before running this cutover');
    await db.query('LOCK TABLE platform_creation_sessions IN ACCESS EXCLUSIVE MODE');
    await db.query(
      'CREATE TEMP TABLE agent_conversation_cutover (id text PRIMARY KEY, row_digest text NOT NULL) ON COMMIT DROP',
    );
    await db.query(
      'CREATE TEMP TABLE agent_draft_delivery_cutover (id text PRIMARY KEY, draft_id text NOT NULL, source_revision integer NOT NULL, payload_digest text NOT NULL, UNIQUE(draft_id,source_revision)) ON COMMIT DROP',
    );
    let cursor = null;
    let total = 0;
    let turns = 0;
    for (;;) {
      const { rows } = await db.query(
        `SELECT id, revision, jsonb_array_length(turns) AS count, to_jsonb(s)::text AS source,
                md5(to_jsonb(s)::text) AS digest
           FROM platform_creation_sessions s
          WHERE ($1::text IS NULL OR id > $1) ORDER BY id LIMIT 32`,
        [cursor],
      );
      if (!rows.length) break;
      const imported = await importRows(rows, false);
      const verified = await importRows(rows, true);
      for (let i = 0; i < rows.length; i++) {
        if (imported[i].sourceDigest !== verified[i].sourceDigest)
          throw Error('Agent read-back digest mismatch');
        await db.query('INSERT INTO agent_conversation_cutover VALUES ($1,$2)', [
          rows[i].id,
          rows[i].digest,
        ]);
        const source = JSON.parse(rows[i].source);
        const deliveries = verified[i].deliveries;
        if (
          !Array.isArray(deliveries) ||
          deliveries.length !==
            source.turns.filter((turn) => turn.result.kind === 'proposal').length
        )
          throw Error('Missing verified draft deliveries');
        for (const delivery of deliveries) {
          const turn = source.turns[delivery.sourceRevision - 1];
          if (
            delivery.draftId !== source.id ||
            turn?.result.kind !== 'proposal' ||
            turn.result.candidate_text !== delivery.candidateText ||
            turn.result.check.candidate_digest !== delivery.digest
          )
            throw Error('Historical delivery differs from the accepted candidate');
          const payload = JSON.stringify([
            delivery.draftId,
            delivery.sourceRevision,
            delivery.baseRevision ?? null,
            delivery.candidateBaseText ?? null,
            delivery.digest,
            delivery.checkId,
            delivery.checkEnvironment,
            delivery.turnId,
          ]);
          const fingerprint = 'sha256:' + createHash('sha256').update(payload).digest('hex');
          await db.query('INSERT INTO agent_draft_delivery_cutover VALUES ($1,$2,$3,$4)', [
            delivery.id,
            delivery.draftId,
            delivery.sourceRevision,
            fingerprint,
          ]);
        }
        turns += rows[i].count;
      }
      total += rows.length;
      cursor = rows.at(-1).id;
    }
    // node-pg-migrate commits this connection's transaction after applying the guarded migration.
    agentLock.assertHeld();
    const applied = await runner({
      dbClient: db,
      dir: migrationDir,
      direction: 'up',
      migrationsTable: 'platform_schema_migrations',
      singleTransaction: true,
      file: '1780000000005-independent-form-drafts',
      log: () => {},
    });
    if (applied.length !== 1 || !applied[0].name.startsWith('1780000000005-'))
      throw Error('Unexpected Platform migration baseline');
    console.log(
      JSON.stringify({
        migratedConversations: total,
        verifiedTurns: turns,
        platformMigration: applied[0].name,
      }),
    );
  }
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  try {
    await db.end();
  } finally {
    await agentLock?.release();
  }
}
