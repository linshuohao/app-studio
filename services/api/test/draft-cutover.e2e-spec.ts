import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { digestText } from '../src/platform/form-drafts.js';

const require = createRequire(import.meta.url);
function migration(name: string): string {
  let sql = '';
  require('../migrations/' + name + '.cjs').up({
    sql: (value: string) => {
      sql = value;
    },
  });
  return sql;
}
it('requires exact conversation and delivery proofs before replacing the legacy table', async () => {
  const db = new Client({ connectionString: process.env.PLATFORM_DATABASE_URL });
  await db.connect();
  try {
    await db.query('BEGIN');
    await db.query('CREATE SCHEMA ownership_cutover');
    await db.query('SET LOCAL search_path=ownership_cutover,public');
    await db.query(
      'CREATE TABLE platform_users(user_id text PRIMARY KEY); CREATE TABLE platform_spaces(space_id text PRIMARY KEY)',
    );
    await db.query(
      "INSERT INTO platform_users VALUES ('user'); INSERT INTO platform_spaces VALUES ('space')",
    );
    await db.query(migration('1780000000003-create-form-sessions'));
    await db.query(migration('1780000000004-agent-drafts'));
    const id = randomUUID(),
      candidate = '{"id":"original"}',
      working = '{"id":"manually edited"}';
    await db.query(
      `INSERT INTO platform_creation_sessions(id,user_id,space_id,document,revision,turns,draft_text,draft_applied) VALUES($1,'user','space','申请',1,$2::jsonb,$3,1)`,
      [
        id,
        JSON.stringify([
          {
            message: '创建',
            result: {
              kind: 'proposal',
              candidate_text: candidate,
              check: { success: true, candidate_digest: digestText(candidate) },
            },
          },
        ]),
        working,
      ],
    );
    const cutover = migration('1780000000005-independent-form-drafts');
    async function rejected(expected: RegExp) {
      await db.query('SAVEPOINT before_cutover');
      await expect(db.query(cutover)).rejects.toThrow(expected);
      await db.query('ROLLBACK TO SAVEPOINT before_cutover');
      expect(
        (await db.query('SELECT count(*)::int AS n FROM platform_creation_sessions')).rows[0]?.n,
      ).toBe(1);
    }
    await rejected(/Import and verify/);
    await db.query(
      "CREATE TEMP TABLE agent_conversation_cutover(id text PRIMARY KEY,row_digest text);INSERT INTO agent_conversation_cutover SELECT id,'stale' FROM platform_creation_sessions",
    );
    await rejected(/out of date/);
    await db.query(
      'UPDATE agent_conversation_cutover p SET row_digest=md5(to_jsonb(s)::text) FROM platform_creation_sessions s WHERE s.id=p.id',
    );
    await rejected(/delivery proof/);
    const receiptId = randomUUID(),
      fingerprint = digestText('original-delivery');
    await db.query(
      'CREATE TEMP TABLE agent_draft_delivery_cutover(id text PRIMARY KEY,draft_id text,source_revision integer,payload_digest text)',
    );
    await db.query('INSERT INTO agent_draft_delivery_cutover VALUES($1,$2,1,$3)', [
      receiptId,
      id,
      fingerprint,
    ]);
    await db.query(cutover);
    expect(
      (
        await db.query(
          'SELECT candidate_text,working_text,applied_digest FROM platform_form_drafts WHERE id=$1',
          [id],
        )
      ).rows[0],
    ).toEqual({
      candidate_text: candidate,
      working_text: working,
      applied_digest: digestText(candidate),
    });
    expect(
      (
        await db.query('SELECT payload_digest FROM platform_draft_deliveries WHERE id=$1', [
          receiptId,
        ])
      ).rows[0]?.payload_digest,
    ).toBe(fingerprint);
    expect(
      (
        await db.query(
          "SELECT to_regclass('ownership_cutover.platform_creation_sessions') AS legacy",
        )
      ).rows[0]?.legacy,
    ).toBeNull();

    await db.query(migration('1780000000001-scenarios'));
    await db.query("INSERT INTO platform_scenarios VALUES ('space',$1,1,$2::jsonb)", [
      randomUUID(),
      JSON.stringify({ name: 'retired example' }),
    ]);
    await db.query(migration('1780000000006-remove-retired-studio-storage'));
    expect(
      (await db.query("SELECT to_regclass('ownership_cutover.platform_scenarios') AS retired"))
        .rows[0]?.retired,
    ).toBeNull();
    expect(
      (await db.query('SELECT to_jsonb(d) AS draft FROM platform_form_drafts d')).rows[0]?.draft,
    ).toMatchObject({ working_text: working, candidate_text: candidate, source_revision: 1 });
    expect(
      (
        await db.query(
          "SELECT column_name FROM information_schema.columns WHERE table_schema='ownership_cutover' AND ((table_name='platform_form_drafts' AND column_name IN ('candidate_check_id','candidate_environment')) OR (table_name='platform_draft_deliveries' AND column_name='source_revision'))",
        )
      ).rows,
    ).toEqual([]);
    expect((await db.query('SELECT payload_digest FROM platform_draft_deliveries')).rows).toEqual([
      { payload_digest: fingerprint },
    ]);
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
