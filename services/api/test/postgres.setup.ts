import { beforeEach, afterEach } from 'vitest';
import { createTestDatabase } from '../tools/test-database.mjs';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let previous: string | undefined;
beforeEach(async () => {
  previous = process.env.PLATFORM_DATABASE_URL;
  database = await createTestDatabase();
  process.env.PLATFORM_DATABASE_URL = database.connectionString;
}, 30000);
afterEach(async () => {
  await database?.dispose();
  if (previous === undefined) delete process.env.PLATFORM_DATABASE_URL;
  else process.env.PLATFORM_DATABASE_URL = previous;
});
