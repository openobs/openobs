import type { SQL } from 'drizzle-orm';
import type { DbClient } from '../../db/client.js';

export async function pgAll<T>(db: DbClient, query: SQL): Promise<T[]> {
  return db.all<T>(query);
}

export async function pgRun(db: DbClient, query: SQL): Promise<void> {
  await db.run(query);
}
