import { runner } from 'node-pg-migrate';
import { fileURLToPath } from 'node:url';

export async function migrate(connectionString) {
  if (!connectionString) throw new Error('PLATFORM_DATABASE_URL is required');
  await runner({
    databaseUrl: connectionString,
    dir: fileURLToPath(new URL('../migrations/', import.meta.url)),
    direction: 'up',
    migrationsTable: 'platform_schema_migrations',
    log: () => {},
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate(process.env.PLATFORM_MIGRATION_DATABASE_URL || process.env.PLATFORM_DATABASE_URL);
  console.log('Platform schema migrations applied');
}
