export function createTestDatabase(): Promise<{
  connectionString: string;
  dispose(): Promise<void>;
}>;
