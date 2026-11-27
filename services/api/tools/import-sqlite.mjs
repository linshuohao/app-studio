import { DatabaseSync, backup } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { Client } from 'pg';
import migrations from './legacy-sqlite-migrations.json' with { type: 'json' };

const quote = (name) => '"' + name.replaceAll('"', '""') + '"';
const digest = (rows) => createHash('sha256').update(JSON.stringify(rows)).digest('hex');
function normalize(value, type) {
  if (value === null) return null;
  if (value instanceof Uint8Array) return { bytes: Buffer.from(value).toString('base64') };
  if (type === 'INTEGER') return String(value);
  return value;
}

export async function importSqlite(sourcePath, connectionString) {
  if (!sourcePath || !connectionString)
    throw new Error('Source snapshot and destination URL are required');
  const directory = await mkdtemp(join(tmpdir(), 'platform-import-'));
  let copy;
  let inTransaction = false;
  const client = new Client({ connectionString });
  try {
    const source = new DatabaseSync(sourcePath, { readOnly: true });
    try {
      await backup(source, join(directory, 'snapshot.sqlite'));
    } finally {
      source.close();
    }
    copy = new DatabaseSync(join(directory, 'snapshot.sqlite'));
    copy.exec('PRAGMA foreign_keys=ON');
    const version = Number(copy.prepare('PRAGMA user_version').get().user_version);
    if (version < 1 || version > migrations.length)
      throw new Error('Unsupported SQLite schema version');
    for (let index = version; index < migrations.length; index++) copy.exec(migrations[index]);
    if (
      copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok' ||
      copy.prepare('PRAGMA foreign_key_check').all().length
    ) {
      throw new Error('SQLite integrity or foreign key validation failed');
    }
    const tables = copy
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'platform_%' ORDER BY rowid",
      )
      .all();
    if (tables.length !== 20) throw new Error('Unexpected source table set');
    await client.connect();
    await client.query('BEGIN');
    inTransaction = true;
    await client.query('SELECT pg_advisory_xact_lock(17017,1)');
    const versions = (await client.query('SELECT name FROM platform_schema_migrations ORDER BY id'))
      .rows;
    if (
      (versions.length !== 6 &&
        !(
          versions[6]?.name === '1780000000006-remove-retired-studio-storage' &&
          (versions.length === 7 ||
            (versions[7]?.name === '1780000000007-agent-partial-draft-issues' &&
              (versions.length === 8 ||
                (versions[8]?.name === '1780000000008-draft-editing' &&
                  (versions.length === 9 ||
                    (versions[9]?.name === '1780000000009-form-diagnostics' &&
                      (versions.length === 10 ||
                        (versions.length === 11 &&
                          versions[10]?.name === '1780000000010-asset-repair-tasks'))))))))
        )) ||
      versions[0]?.name !== '1780000000000-platform' ||
      versions[1]?.name !== '1780000000001-scenarios' ||
      versions[2]?.name !== '1780000000002-working-versions' ||
      versions[3]?.name !== '1780000000003-create-form-sessions' ||
      versions[4]?.name !== '1780000000004-agent-drafts' ||
      versions[5]?.name !== '1780000000005-independent-form-drafts'
    )
      throw new Error('Unsupported destination schema');
    for (const { name } of tables) {
      if (Number((await client.query(`SELECT count(*) FROM ${quote(name)}`)).rows[0].count))
        throw new Error(`Destination table is not empty: ${name}`);
    }
    const sequenceRestarts = [];
    const report = [];
    for (const { name } of tables) {
      const columns = copy.prepare(`PRAGMA table_info(${quote(name)})`).all();
      if (name === 'platform_releases')
        columns.unshift({ name: 'release_sequence', type: 'INTEGER' });
      const names = columns.map((c) => c.name);
      const rows = copy
        .prepare(
          `SELECT ${name === 'platform_releases' ? 'rowid AS release_sequence,' : ''} * FROM ${quote(name)} ORDER BY rowid`,
        )
        .all();
      for (const row of rows) {
        const values = names.map((column) => {
          const value = row[column];
          if (typeof value === 'string' && value.includes('\0'))
            throw new Error(`Unsupported NUL in ${name}.${column}; source preserved`);
          if (typeof value === 'number' && !Number.isSafeInteger(value))
            throw new Error(`Unsafe integer in ${name}.${column}`);
          return value instanceof Uint8Array ? Buffer.from(value) : value;
        });
        await client.query(
          `INSERT INTO ${quote(name)} (${names.map(quote).join(',')}) VALUES (${names.map((_, i) => '$' + (i + 1)).join(',')})`,
          values,
        );
      }
      const pk = columns
        .filter((c) => c.pk)
        .sort((a, b) => a.pk - b.pk)
        .map((c) => c.name);
      const order = name === 'platform_releases' ? ['release_sequence'] : pk;
      const canonical = (list) =>
        list
          .map((row) => columns.map((c) => normalize(row[c.name], c.type)))
          .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b), 'en'));
      const target = (
        await client.query(
          `SELECT ${names.map(quote).join(',')} FROM ${quote(name)}${order.length ? ' ORDER BY ' + order.map(quote).join(',') : ''}`,
        )
      ).rows;
      if (digest(canonical(rows)) !== digest(canonical(target)))
        throw new Error(`Data verification failed: ${name}`);
      for (const column of columns.filter(
        (c) => c.name === 'sequence' || c.name === 'release_sequence',
      )) {
        const restart = (
          await client.query(
            `SELECT format('ALTER SEQUENCE %s RESTART WITH %s', pg_get_serial_sequence($1,$2), COALESCE(MAX(${quote(column.name)}),0)+1) AS sql FROM ${quote(name)}`,
            [name, column.name],
          )
        ).rows[0].sql;
        sequenceRestarts.push(restart);
      }

      report.push({ table: name, rows: rows.length, digest: digest(canonical(rows)) });
    }
    // ALTER SEQUENCE RESTART is transactional, unlike setval.
    for (const sql of sequenceRestarts) await client.query(sql);
    await client.query('COMMIT');
    inTransaction = false;
    return { sourceVersion: version, tables: report };
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end().catch(() => {});
    copy?.close();
    await rm(directory, { recursive: true, force: true });
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await importSqlite(
    process.argv[2],
    process.env.PLATFORM_MIGRATION_DATABASE_URL || process.env.PLATFORM_DATABASE_URL,
  );
  console.log(JSON.stringify(result, null, 2));
}
