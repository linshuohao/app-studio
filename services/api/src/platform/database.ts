import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient, type QueryResultRow, types } from 'pg';

// Existing API contracts expose safe integer revisions and epoch milliseconds.
types.setTypeParser(20, (text: string) => {
  const value = Number(text);
  if (!Number.isSafeInteger(value)) throw new RangeError('Database integer exceeds API precision');
  return value;
});

export class QueryExecutor {
  constructor(private readonly connection: Pool | PoolClient) {}

  async many<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<T[]> {
    return (await this.connection.query<T>(sql, values)).rows;
  }

  async one<T extends QueryResultRow = Record<string, unknown>>(
    sql: string,
    values: unknown[] = [],
  ): Promise<T | undefined> {
    return (await this.many<T>(sql, values))[0];
  }

  async execute(sql: string, values: unknown[] = []) {
    return this.connection.query(sql, values);
  }
}

@Injectable()
export class PlatformDatabase implements OnModuleInit, OnModuleDestroy {
  private pool?: Pool;
  private readonly logger = new Logger(PlatformDatabase.name);

  async onModuleInit(): Promise<void> {
    const rows = await this.executor.many<{ name: string }>(
      'SELECT name FROM platform_schema_migrations ORDER BY id',
    );
    if (
      rows.length !== 11 ||
      rows[0]?.name !== '1780000000000-platform' ||
      rows[1]?.name !== '1780000000001-scenarios' ||
      rows[2]?.name !== '1780000000002-working-versions' ||
      rows[3]?.name !== '1780000000003-create-form-sessions' ||
      rows[4]?.name !== '1780000000004-agent-drafts' ||
      rows[5]?.name !== '1780000000005-independent-form-drafts' ||
      rows[6]?.name !== '1780000000006-remove-retired-studio-storage' ||
      rows[7]?.name !== '1780000000007-agent-partial-draft-issues' ||
      rows[8]?.name !== '1780000000008-draft-editing' ||
      rows[9]?.name !== '1780000000009-form-diagnostics' ||
      rows[10]?.name !== '1780000000010-asset-repair-tasks'
    ) {
      throw new Error('Unsupported Platform schema; run the release migration before startup');
    }
  }

  get executor(): QueryExecutor {
    return new QueryExecutor(this.connection());
  }

  private connection(): Pool {
    if (!this.pool) {
      const connectionString = process.env.PLATFORM_DATABASE_URL;
      if (!connectionString) throw new Error('PLATFORM_DATABASE_URL is required');
      this.pool = new Pool({ connectionString, max: 10, connectionTimeoutMillis: 5000 });
      this.pool.on('error', () => this.logger.error('Idle PostgreSQL connection failed'));
    }
    return this.pool;
  }

  async transaction<T>(operation: (tx: QueryExecutor) => Promise<T>): Promise<T> {
    const client = await this.connection().connect();
    let broken = false;
    const onError = () => {
      broken = true;
      this.logger.error('Active PostgreSQL connection failed');
    };
    client.on('error', onError);
    try {
      await client.query('BEGIN');
      // All current Platform writes coordinate on this transaction lock, including
      // absent identities and first-admin initialization. No network work holds it.
      await client.query('SELECT pg_advisory_xact_lock(17017, 1)');
      const result = await operation(new QueryExecutor(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        broken = true;
      }
      throw error;
    } finally {
      client.release(broken);
      // Destroyed clients may emit a final socket error after release.
      if (!broken) client.removeListener('error', onError);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
