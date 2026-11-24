export function importSqlite(
  sourcePath: string,
  connectionString: string,
): Promise<{ sourceVersion: number; tables: { table: string; rows: number; digest: string }[] }>;
