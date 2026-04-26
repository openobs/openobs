import { createSqliteClient, type SqliteClient } from '../db/sqlite-client.js';
import { applySchema } from '../db/schema-applier.js';

/**
 * Open a fresh in-memory SQLite database, apply the consolidated schema, and
 * return the wired SqliteClient.
 *
 * Intended for unit/integration tests. Every new repository test in this
 * wave calls this to get a clean DB.
 *
 * NOTE: each call creates a brand-new in-memory instance — no sharing between
 * tests, no cleanup required. `:memory:` databases in better-sqlite3 vanish
 * the moment the underlying `Database` handle is GC'd.
 */
export function createTestDb(): SqliteClient {
  const db = createSqliteClient({ path: ':memory:', wal: false });
  applySchema(db);
  return db;
}
