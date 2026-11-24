import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PlatformDatabase } from '../src/platform/database.js';
import { importSqlite } from '../tools/import-sqlite.mjs';
import migrations from '../tools/legacy-sqlite-migrations.json' with { type: 'json' };

it('imports all 20 tables without changing source bytes, preserves ordering and advances identities', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'platform-import-test-'));
  const path = join(directory, 'source.sqlite');
  const source = new DatabaseSync(path);
  const storage = new PlatformDatabase();
  try {
    for (const sql of migrations) source.exec(sql);
    source.exec(`PRAGMA user_version = ${migrations.length}`);
    source.exec(`
      INSERT INTO platform_spaces VALUES ('s');
      INSERT INTO platform_users VALUES ('u',1);
      INSERT INTO platform_credentials VALUES ('admin','u','salt','hash');
      INSERT INTO platform_members VALUES ('m','u','s',1);
      INSERT INTO platform_member_roles VALUES ('m','admin');
      INSERT INTO platform_sessions VALUES ('token-hash','u','github:42',9999999999999,NULL);
      INSERT INTO platform_forms (form_id,space_id,name,created_by,created_at) VALUES ('f','s','中文','u','2026-01-01');
      INSERT INTO platform_versions (sequence,version_id,form_id,text,saved_by,saved_at) VALUES (42,'v','f',X'207B0D0A00FF','u','2026-01-01');
      INSERT INTO platform_receipts VALUES ('s','u','save','key','fingerprint','v');
      INSERT INTO platform_form_audit VALUES (42,'f','u','archive','2026-01-01');
      INSERT INTO platform_release_requests (request_id,space_id,user_id,member_id,request_key,fingerprint,form_id,version_id,build_input) VALUES ('rq','s','u','m','release-key','fp','f','v','{}');
      INSERT INTO platform_releases (rowid,release_id,request_id,form_id,version_id,target,prepared_text,digest,diagnostics,release_name) VALUES (71,'r','rq','f','v','web','{ "raw": true }','exact-digest','[]','first');
      INSERT INTO platform_release_audit VALUES ('r','u','2026-01-01');
      INSERT INTO platform_github_bindings VALUES (42,'u','gh','login',NULL);
      INSERT INTO platform_github_flows (state_hash,browser_hash,user_id,verifier,binding_sequence,expires_at) VALUES ('state','browser','u','verifier',42,9999999999999);
      INSERT INTO platform_member_changes VALUES (42,'m','u','{}','2026-01-01');
      INSERT INTO platform_github_registrations VALUES ('browser','gh','login',42,NULL,9999999999999);
      INSERT INTO platform_account_changes VALUES (42,'u','u','{}','2026-01-01');
      INSERT INTO platform_join_requests (sequence,request_id,user_id,space_id,explanation,status,created_at) VALUES (42,'join','u','s','中文申请','pending','2026-01-01');
      INSERT INTO platform_password_setup_proofs VALUES ('browser','proof','u',42,'gh',9999999999999);
    `);
    source.close();
    const hash = async () =>
      createHash('sha256')
        .update(await readFile(path))
        .digest('hex');
    const before = await hash();
    const result = await importSqlite(path, process.env.PLATFORM_DATABASE_URL!);
    expect(result.tables).toHaveLength(20);
    expect(result.tables.every((table) => table.rows === 1)).toBe(true);
    expect(await hash()).toBe(before);
    expect((await storage.executor.one('SELECT text FROM platform_versions'))?.text).toEqual(
      Buffer.from('207b0d0a00ff', 'hex'),
    );
    expect(
      await storage.executor.one(
        'SELECT release_sequence, prepared_text, digest FROM platform_releases',
      ),
    ).toEqual({ release_sequence: 71, prepared_text: '{ "raw": true }', digest: 'exact-digest' });
    for (const table of [
      'platform_versions',
      'platform_form_audit',
      'platform_github_bindings',
      'platform_member_changes',
      'platform_account_changes',
      'platform_join_requests',
      'platform_releases',
    ]) {
      const column = table === 'platform_releases' ? 'release_sequence' : 'sequence';
      const row = await storage.executor.one(
        'SELECT nextval(pg_get_serial_sequence($1,$2)) AS next',
        [table, column],
      );
      expect(row?.next).toBe(table === 'platform_releases' ? 72 : 43);
    }
    await expect(importSqlite(path, process.env.PLATFORM_DATABASE_URL!)).rejects.toThrow(
      'not empty',
    );
    expect(await hash()).toBe(before);
  } finally {
    if (source.isOpen) source.close();
    await storage.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
});

it('rolls back the entire import on incompatible text and fails startup on unknown schema', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'platform-import-invalid-'));
  const path = join(directory, 'source.sqlite');
  const source = new DatabaseSync(path);
  const storage = new PlatformDatabase();
  try {
    for (const sql of migrations) source.exec(sql);
    source.exec(`PRAGMA user_version = ${migrations.length}`);
    source.exec(
      "INSERT INTO platform_spaces VALUES ('s'); INSERT INTO platform_users VALUES ('u',1)",
    );
    source
      .prepare('INSERT INTO platform_credentials VALUES (?,?,?,?)')
      .run('name\0bad', 'u', 'salt', 'hash');
    source.exec('PRAGMA user_version = 0');
    await expect(importSqlite(path, process.env.PLATFORM_DATABASE_URL!)).rejects.toThrow(
      'Unsupported SQLite schema',
    );
    source.exec(`PRAGMA user_version = ${migrations.length}`);
    source.close();
    await expect(importSqlite(path, process.env.PLATFORM_DATABASE_URL!)).rejects.toThrow(
      'Unsupported NUL',
    );
    expect(await storage.executor.many('SELECT * FROM platform_spaces')).toEqual([]);
    await storage.onModuleInit();
    await storage.executor.execute(
      "INSERT INTO platform_schema_migrations (name,run_on) VALUES ('unknown',now())",
    );
    await expect(storage.onModuleInit()).rejects.toThrow('Unsupported Platform schema');
    await expect(importSqlite(path, process.env.PLATFORM_DATABASE_URL!)).rejects.toThrow(
      'Unsupported destination schema',
    );
  } finally {
    if (source.isOpen) source.close();
    await storage.onModuleDestroy();
    await rm(directory, { recursive: true, force: true });
  }
});
