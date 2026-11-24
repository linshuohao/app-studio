import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { expect, it } from 'vitest';
import { PlatformDatabase } from '../src/platform/database.js';

it('starts and writes with a runtime role that cannot change schema or migration history', async () => {
  const ownerUrl = process.env.PLATFORM_DATABASE_URL!;
  const role = 'platform_test_role_' + randomUUID().replaceAll('-', '');
  const password = randomUUID();
  const owner = new Client({ connectionString: ownerUrl });
  const storage = new PlatformDatabase();
  await owner.connect();
  try {
    // Both identifiers and password are generated UUID-derived test values.
    await owner.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}'`);
    await owner.query(`REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      GRANT USAGE ON SCHEMA public TO "${role}";
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${role}";
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${role}";
      REVOKE INSERT, UPDATE, DELETE ON platform_schema_migrations FROM "${role}"`);
    const url = new URL(ownerUrl);
    url.username = role;
    url.password = password;
    process.env.PLATFORM_DATABASE_URL = url.toString();
    await storage.onModuleInit();
    await storage.transaction(async (tx) => {
      await tx.execute("INSERT INTO platform_users VALUES ('runtime-user',1)");
      await tx.execute(
        "INSERT INTO platform_account_changes (user_id,actor_id,state,recorded_at) VALUES ('runtime-user','runtime-user','{}','2026-01-01')",
      );
    });
    expect(
      (await storage.executor.one('SELECT count(*) AS n FROM platform_account_changes'))?.n,
    ).toBe(1);
    await expect(storage.executor.execute('CREATE TABLE forbidden (id int)')).rejects.toMatchObject(
      { code: '42501' },
    );
    await expect(
      storage.executor.execute('DELETE FROM platform_schema_migrations'),
    ).rejects.toMatchObject({ code: '42501' });
  } finally {
    process.env.PLATFORM_DATABASE_URL = ownerUrl;
    await storage.onModuleDestroy();
    await owner.query(`DROP OWNED BY "${role}"`);
    await owner.query(`DROP ROLE "${role}"`);
    await owner.end();
  }
});
