import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import { expect, it, vi } from 'vitest';
import { PlatformDatabase } from '../src/platform/database.js';

it('recovers an idle disconnected pool connection without an uncaught error', async () => {
  const storage = new PlatformDatabase();
  const admin = new Client({ connectionString: process.env.PLATFORM_DATABASE_URL });
  const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  try {
    const row = await storage.executor.one('SELECT pg_backend_pid() AS pid');
    await admin.connect();
    await admin.query('SELECT pg_terminate_backend($1)', [row?.pid]);
    await vi.waitFor(() =>
      expect(logged).toHaveBeenCalledWith('Idle PostgreSQL connection failed'),
    );
    const recovered = await storage.executor.one('SELECT pg_backend_pid() AS pid');
    expect(recovered?.pid).not.toBe(row?.pid);
  } finally {
    await admin.end();
    await storage.onModuleDestroy();
    logged.mockRestore();
  }
});

it('keeps the original transaction error when rollback loses its connection', async () => {
  const storage = new PlatformDatabase();
  try {
    await expect(
      storage.transaction(async (tx) => {
        await tx.execute('SELECT pg_terminate_backend(pg_backend_pid())');
      }),
    ).rejects.toMatchObject({ code: '57P01' });
    expect(await storage.executor.one('SELECT 1 AS value')).toEqual({ value: 1 });
  } finally {
    await storage.onModuleDestroy();
  }
});
