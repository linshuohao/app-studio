import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { defaultSpaceId, hashPassword, usernamePattern, validPassword } from './credentials.js';
import { PlatformDatabase } from './database.js';

async function initialize() {
  const username = process.argv[2];
  if (!username || !usernamePattern.test(username) || process.stdin.isTTY) {
    throw new Error('Usage: pass the initial password via stdin and the username as an argument');
  }
  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const { value: password } = await input[Symbol.asyncIterator]().next();
  input.close();
  if (!validPassword(password) || password.length < 12) {
    throw new Error('Initial password must contain at least 12 characters and at most 256 bytes');
  }
  const { salt, hash } = await hashPassword(password);
  const storage = new PlatformDatabase();
  try {
    await storage.onModuleInit();
    await storage.transaction(async (db) => {
      if (await db.one('SELECT 1 FROM platform_spaces WHERE space_id = $1', [defaultSpaceId])) {
        throw new Error('Platform is already initialized');
      }
      const userId = randomUUID();
      const memberId = randomUUID();
      await db.execute('INSERT INTO platform_spaces (space_id) VALUES ($1)', [defaultSpaceId]);
      await db.execute('INSERT INTO platform_users VALUES ($1, 1)', [userId]);
      await db.execute('INSERT INTO platform_credentials VALUES ($1, $2, $3, $4)', [
        username,
        userId,
        salt,
        hash,
      ]);
      await db.execute('INSERT INTO platform_members VALUES ($1, $2, $3, 1)', [
        memberId,
        userId,
        defaultSpaceId,
      ]);
      await db.execute("INSERT INTO platform_member_roles VALUES ($1, 'admin')", [memberId]);
    });
  } finally {
    await storage.onModuleDestroy();
  }
  process.stdout.write('Platform administrator initialized\n');
}

initialize().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Initialization failed'}\n`);
  process.exitCode = 1;
});
