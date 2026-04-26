import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { SqliteClient } from './sqlite-client.js';

/**
 * Locate `sqlite-schema.sql` next to this module. In dev (tsx, src tree) the
 * file sits alongside the .ts source; in built dist the .sql isn't copied by
 * tsc, so we fall back to the sibling src tree.
 */
function loadSchemaSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'sqlite-schema.sql'),
    join(here, '..', '..', 'src', 'db', 'sqlite-schema.sql'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return readFileSync(c, 'utf8');
  }
  throw new Error(
    `[data-layer] could not locate sqlite-schema.sql. Tried: ${candidates.join(', ')}`,
  );
}

/**
 * Split a SQL script into individual statements. Strips `--` line comments
 * and skips whitespace-only chunks. Does not attempt full SQL lexing — our
 * schema is DDL + simple seed inserts with no string literals containing
 * semicolons.
 */
export function splitSqlStatements(script: string): string[] {
  const sansComments = script
    .split(/\r?\n/)
    .map((line) => {
      const idx = line.indexOf('--');
      return idx >= 0 ? line.slice(0, idx) : line;
    })
    .join('\n');

  return sansComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Create every table and index defined in `sqlite-schema.sql`. Idempotent —
 * every statement is `CREATE ... IF NOT EXISTS`, so calling it on an
 * already-built database is a no-op.
 */
export function applySchema(db: SqliteClient): void {
  const statements = splitSqlStatements(loadSchemaSql());
  for (const stmt of statements) {
    db.run(sql.raw(stmt));
  }
}
