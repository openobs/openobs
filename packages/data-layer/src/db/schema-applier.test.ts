import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { createSqliteClient } from './sqlite-client.js';
import { applySchema, splitSqlStatements } from './schema-applier.js';

describe('applySchema()', () => {
  it('creates every expected table on a fresh in-memory DB', () => {
    const db = createSqliteClient({ path: ':memory:', wal: false });
    applySchema(db);

    const expected = [
      'org', 'user', 'user_auth', 'user_auth_token',
      'org_user', 'team', 'team_member', 'api_key',
      'role', 'permission', 'builtin_role', 'user_role', 'team_role',
      'folder', 'dashboard_acl', 'preferences', 'quota', 'audit_log',
      'instance_llm_config', 'instance_datasources',
      'notification_channels', 'instance_settings',
    ];

    const rows = db.all<{ name: string }>(sql`SELECT name FROM sqlite_master WHERE type='table'`);
    const names = new Set(rows.map((r) => r.name));
    for (const t of expected) {
      expect(names, `expected table ${t}`).toContain(t);
    }
  });

  it('seeds org_main', () => {
    const db = createSqliteClient({ path: ':memory:', wal: false });
    applySchema(db);
    const rows = db.all<{ id: string; name: string }>(sql`SELECT id, name FROM org WHERE id = 'org_main'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Main Org');
  });

  it('dashboards has org_id and folder_uid columns', () => {
    const db = createSqliteClient({ path: ':memory:', wal: false });
    applySchema(db);
    const cols = db.all<{ name: string }>(sql.raw(`PRAGMA table_info(dashboards)`));
    const colNames = new Set(cols.map((c) => c.name));
    expect(colNames).toContain('org_id');
    expect(colNames).toContain('folder_uid');
  });

  it('is idempotent — second applySchema() is a no-op', () => {
    const db = createSqliteClient({ path: ':memory:', wal: false });
    applySchema(db);
    const firstCount = db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`,
    )[0]!.n;
    applySchema(db);
    const secondCount = db.all<{ n: number }>(
      sql`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table'`,
    )[0]!.n;
    expect(secondCount).toBe(firstCount);
  });
});

describe('splitSqlStatements()', () => {
  it('splits simple DDL', () => {
    const out = splitSqlStatements(`
      CREATE TABLE a (id TEXT);
      CREATE TABLE b (id TEXT);
    `);
    expect(out).toEqual(['CREATE TABLE a (id TEXT)', 'CREATE TABLE b (id TEXT)']);
  });

  it('strips -- line comments', () => {
    const out = splitSqlStatements(`
      -- leading comment
      CREATE TABLE a (
        id TEXT -- inline
      );
    `);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('CREATE TABLE a');
    expect(out[0]).not.toContain('inline');
  });

  it('ignores empty / whitespace-only statements', () => {
    const out = splitSqlStatements(`;;  ;\nCREATE TABLE a (id TEXT);\n;`);
    expect(out).toEqual(['CREATE TABLE a (id TEXT)']);
  });
});
