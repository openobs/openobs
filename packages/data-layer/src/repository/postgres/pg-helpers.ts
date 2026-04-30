import type { SQL } from 'drizzle-orm';
import type { QueryClient } from '../../db/query-client.js';

export async function pgAll<T>(db: QueryClient, query: SQL): Promise<T[]> {
  return db.all<T>(query);
}

export async function pgRun(db: QueryClient, query: SQL): Promise<void> {
  await db.run(query);
}
