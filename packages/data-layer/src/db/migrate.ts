import { sql } from 'drizzle-orm';
import type { SqliteClient } from './sqlite-client.js';

// -- Schema versioning ---------------------------------------------------------

const SCHEMA_VERSION = 3;

/**
 * Create all tables if they don't exist, and track schema version.
 */
export function ensureSchema(db: SqliteClient): void {
  // Create the _migrations tracking table
  db.run(sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Check current version
  const rows = db.all<{ version: number }>(sql`
    SELECT version FROM _migrations ORDER BY version DESC LIMIT 1
  `);

  const currentVersion = rows.length > 0 ? rows[0]!.version : 0;

  if (currentVersion >= SCHEMA_VERSION) {
    return; // Already up to date
  }

  // -- V2 migration: fix investigation_reports FK
  if (currentVersion === 1) {
    // SQLite can't ALTER TABLE to drop FK, so recreate the table
    db.run(sql.raw(`DROP TABLE IF EXISTS investigation_reports`));
  }

  // -- V3 migration: add chat_sessions, chat_messages, and session_id to dashboards
  if (currentVersion <= 2) {
    // Add session_id column to dashboards if it doesn't exist
    try {
      db.run(sql.raw(`ALTER TABLE dashboards ADD COLUMN session_id TEXT`));
    } catch { /* column may already exist */ }
  }

  // Create all schema tables via Drizzle's push mechanism
  // We use raw SQL CREATE TABLE IF NOT EXISTS for reliability
  const tableDefinitions = [
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      session_id TEXT,
      user_id TEXT,
      intent TEXT NOT NULL,
      structured_intent TEXT,
      plan TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      hypotheses TEXT NOT NULL DEFAULT '[]',
      actions TEXT NOT NULL DEFAULT '[]',
      evidence TEXT NOT NULL DEFAULT '[]',
      symptoms TEXT NOT NULL DEFAULT '[]',
      workspace_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS investigation_follow_ups (
      id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS investigation_feedback (
      id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      helpful INTEGER NOT NULL,
      comment TEXT,
      root_cause_verdict TEXT,
      hypothesis_feedbacks TEXT,
      action_feedbacks TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS investigation_conclusions (
      investigation_id TEXT PRIMARY KEY REFERENCES investigations(id) ON DELETE CASCADE,
      conclusion TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      service_ids TEXT NOT NULL DEFAULT '[]',
      investigation_ids TEXT NOT NULL DEFAULT '[]',
      timeline TEXT NOT NULL DEFAULT '[]',
      assignee TEXT,
      workspace_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      resolved_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS feed_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'unread',
      feedback TEXT,
      feedback_comment TEXT,
      hypothesis_feedback TEXT,
      action_feedback TEXT,
      investigation_id TEXT,
      followed_up INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      context TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      expires_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      resolved_by_roles TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS share_links (
      token TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
      created_by TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'view_only',
      expires_at TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL DEFAULT 'dashboard',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      prompt TEXT NOT NULL,
      user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'generating',
      panels TEXT NOT NULL DEFAULT '[]',
      variables TEXT NOT NULL DEFAULT '[]',
      refresh_interval_sec INTEGER NOT NULL DEFAULT 30,
      datasource_ids TEXT NOT NULL DEFAULT '[]',
      use_existing_metrics INTEGER NOT NULL DEFAULT 1,
      folder TEXT,
      workspace_id TEXT,
      session_id TEXT,
      version INTEGER,
      publish_status TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS dashboard_messages (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      actions TEXT,
      timestamp TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS alert_rules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      original_prompt TEXT,
      condition TEXT NOT NULL,
      evaluation_interval_sec INTEGER NOT NULL DEFAULT 60,
      severity TEXT NOT NULL,
      labels TEXT,
      state TEXT NOT NULL DEFAULT 'normal',
      state_changed_at TEXT NOT NULL,
      pending_since TEXT,
      notification_policy_id TEXT,
      investigation_id TEXT,
      workspace_id TEXT,
      created_by TEXT NOT NULL,
      last_evaluated_at TEXT,
      last_fired_at TEXT,
      fire_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS alert_history (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      rule_name TEXT NOT NULL,
      from_state TEXT NOT NULL,
      to_state TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      threshold INTEGER NOT NULL DEFAULT 0,
      timestamp TEXT NOT NULL,
      labels TEXT NOT NULL DEFAULT '{}'
    )`,
    `CREATE TABLE IF NOT EXISTS alert_silences (
      id TEXT PRIMARY KEY,
      matchers TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notification_policies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      matchers TEXT NOT NULL,
      channels TEXT NOT NULL,
      group_by TEXT,
      group_wait_sec INTEGER,
      group_interval_sec INTEGER,
      repeat_interval_sec INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS contact_points (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      integrations TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS notification_policy_tree (
      id TEXT PRIMARY KEY DEFAULT 'root',
      tree TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS mute_timings (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      time_intervals TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      members TEXT NOT NULL DEFAULT '[]',
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS asset_versions (
      id TEXT PRIMARY KEY,
      asset_type TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      snapshot TEXT NOT NULL,
      diff TEXT,
      edited_by TEXT NOT NULL,
      edit_source TEXT NOT NULL,
      message TEXT,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS post_mortems (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      impact TEXT NOT NULL,
      timeline TEXT NOT NULL,
      root_cause TEXT NOT NULL,
      actions_taken TEXT NOT NULL,
      lessons_learned TEXT NOT NULL,
      action_items TEXT NOT NULL,
      generated_at TEXT NOT NULL,
      generated_by TEXT NOT NULL DEFAULT 'llm'
    )`,
    `CREATE TABLE IF NOT EXISTS investigation_reports (
      id TEXT PRIMARY KEY,
      dashboard_id TEXT NOT NULL,
      goal TEXT NOT NULL,
      summary TEXT NOT NULL,
      sections TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      context_summary TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      actions TEXT,
      timestamp TEXT NOT NULL
    )`,
  ];

  for (const ddl of tableDefinitions) {
    db.run(sql.raw(ddl));
  }

  // Record migration
  db.run(sql`INSERT INTO _migrations (version) VALUES (${SCHEMA_VERSION})`);
}
