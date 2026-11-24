import { Client } from 'pg';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { migrate } from './migrate.mjs';

export async function createTestDatabase() {
  const localFile = new URL('../.env.test.local', import.meta.url);
  const local = existsSync(localFile) ? parseEnv(readFileSync(localFile, 'utf8')) : {};
  const base = process.env.PLATFORM_TEST_DATABASE_URL ?? local.PLATFORM_TEST_DATABASE_URL;
  if (!base)
    throw new Error(
      'Set PLATFORM_TEST_DATABASE_URL to a disposable PostgreSQL administrator database',
    );
  const name = 'platform_test_' + randomUUID().replaceAll('-', '');
  const client = new Client({ connectionString: base });
  await client.connect();
  await client.query(`CREATE DATABASE "${name}"`);
  await client.end();
  const url = new URL(base);
  url.pathname = '/' + name;
  const connectionString = url.toString();
  const dispose = async () => {
    const admin = new Client({ connectionString: base });
    await admin.connect();
    try {
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  };
  try {
    await migrate(connectionString);
  } catch (error) {
    await dispose();
    throw error;
  }
  return { connectionString, dispose };
}
