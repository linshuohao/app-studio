import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { DatabaseSync, backup } from 'node:sqlite';
import migrations from '../tools/legacy-sqlite-migrations.json' with { type: 'json' };
function openLegacyCopy(path) {
  const db = new DatabaseSync(path);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = version; i < migrations.length; i++) db.exec(migrations[i]);
  db.exec(`PRAGMA user_version = ${migrations.length}`);
  return db;
}
const source = resolve(process.argv[2]);
const checksum = () => createHash('sha256').update(readFileSync(source)).digest('hex');
const hash = checksum();
const directory = mkdtempSync(join(tmpdir(), 'release-name-migration-'));
const tables = [
  'platform_forms',
  'platform_versions',
  'platform_releases',
  'platform_release_requests',
  'platform_release_audit',
];
const snapshot = (db) =>
  Object.fromEntries(
    tables.map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table} ORDER BY rowid`)
        .all()
        .map(({ release_name: _releaseName, version_name: _versionName, ...row }) => row),
    ]),
  );
let original, upgraded;
try {
  original = new DatabaseSync(source, { readOnly: true });
  const before = snapshot(original);
  const oldVersion = original.prepare('PRAGMA user_version').get().user_version;
  const copy = join(directory, 'copy.sqlite');
  await backup(original, copy);
  original.close();
  original = undefined;
  upgraded = openLegacyCopy(copy);
  assert.deepEqual(snapshot(upgraded), before);
  assert.equal(
    upgraded
      .prepare('SELECT COUNT(*) AS n FROM platform_releases WHERE release_name IS NOT NULL')
      .get().n,
    0,
  );
  const version = upgraded.prepare('PRAGMA user_version').get().user_version;
  assert.ok(version >= oldVersion);
  upgraded.close();
  upgraded = openLegacyCopy(copy);
  assert.deepEqual(snapshot(upgraded), before);
  assert.equal(checksum(), hash);
  console.log(
    JSON.stringify({
      oldVersion,
      version,
      forms: before.platform_forms.length,
      versions: before.platform_versions.length,
      releases: before.platform_releases.length,
      originalSha256: hash,
      unchanged: true,
    }),
  );
} finally {
  original?.close();
  upgraded?.close();
  rmSync(directory, { recursive: true, force: true });
}
