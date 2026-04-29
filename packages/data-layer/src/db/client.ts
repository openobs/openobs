import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
import { renderSql, type QueryClient } from './query-client.js';

export type DbClient = ReturnType<typeof createDbClient>;

export interface DbClientOptions {
  url: string;
  poolSize?: number;
  ssl?: boolean;
}

export function createDbClient(
  opts: DbClientOptions,
): ReturnType<typeof drizzle<typeof schema>> & { $pool: Pool } & QueryClient {
  const pool = new Pool({
    connectionString: opts.url,
    max: opts.poolSize ?? 10,
    ssl: opts.ssl ? { rejectUnauthorized: process.env['DB_SSL_REJECT_UNAUTHORIZED'] !== 'false' } : undefined,
  });

  return Object.assign(drizzle(pool, { schema }), {
    $pool: pool,
    async all<T>(query: Parameters<QueryClient['all']>[0]): Promise<T[]> {
      const { text, params } = renderSql(query);
      const result = await pool.query(text, params);
      return result.rows as T[];
    },
    async run(query: Parameters<QueryClient['run']>[0]): Promise<void> {
      const { text, params } = renderSql(query);
      await pool.query(text, params);
    },
  });
}
