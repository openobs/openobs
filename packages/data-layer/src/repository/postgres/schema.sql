-- Consolidated Postgres schema for openobs.
--
-- Single source of truth for the Postgres-side schema (instance config +
-- investigations). The W6 stores (dashboards, alert rules, etc.) remain
-- SQLite-only — see ./README.md for the rationale. Applied on startup via
-- `applyPostgresSchema(db)`; every statement is `IF NOT EXISTS` so the call
-- is idempotent.

-- ============================================================================
-- Instance config
-- ============================================================================

CREATE TABLE IF NOT EXISTS instance_llm_config (
  id             TEXT PRIMARY KEY CHECK (id = 'singleton'),
  provider       TEXT NOT NULL,
  api_key        TEXT NULL,
  model          TEXT NOT NULL,
  base_url       TEXT NULL,
  auth_type      TEXT NULL,
  region         TEXT NULL,
  api_key_helper TEXT NULL,
  api_format     TEXT NULL,
  updated_at     TEXT NOT NULL,
  updated_by     TEXT NULL
);

CREATE TABLE IF NOT EXISTS instance_datasources (
  id          TEXT PRIMARY KEY,
  org_id      TEXT NOT NULL,
  type        TEXT NOT NULL,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  environment TEXT NULL,
  cluster     TEXT NULL,
  label       TEXT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  api_key     TEXT NULL,
  username    TEXT NULL,
  password    TEXT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  updated_by  TEXT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_instance_datasources_org_name ON instance_datasources(org_id, name);
CREATE INDEX        IF NOT EXISTS ix_instance_datasources_org_id   ON instance_datasources(org_id);
CREATE INDEX        IF NOT EXISTS ix_instance_datasources_type     ON instance_datasources(type);

CREATE TABLE IF NOT EXISTS notification_channels (
  id         TEXT PRIMARY KEY,
  org_id     TEXT NULL,
  type       TEXT NOT NULL,
  name       TEXT NOT NULL,
  config     TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NULL
);

CREATE INDEX IF NOT EXISTS ix_notification_channels_org_id ON notification_channels(org_id);
CREATE INDEX IF NOT EXISTS ix_notification_channels_type   ON notification_channels(type);

CREATE TABLE IF NOT EXISTS instance_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ============================================================================
-- Investigations
-- ============================================================================

CREATE TABLE IF NOT EXISTS investigations (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  session_id        TEXT NULL,
  user_id           TEXT NULL,
  intent            TEXT NOT NULL,
  structured_intent JSONB NULL,
  plan              JSONB NULL,
  status            TEXT NOT NULL DEFAULT 'pending',
  hypotheses        JSONB NOT NULL DEFAULT '[]'::jsonb,
  actions           JSONB NOT NULL DEFAULT '[]'::jsonb,
  evidence          JSONB NOT NULL DEFAULT '[]'::jsonb,
  symptoms          JSONB NOT NULL DEFAULT '[]'::jsonb,
  workspace_id      TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at       TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS investigations_tenant_idx     ON investigations(tenant_id);
CREATE INDEX IF NOT EXISTS investigations_session_idx    ON investigations(session_id);
CREATE INDEX IF NOT EXISTS investigations_status_idx     ON investigations(status);
CREATE INDEX IF NOT EXISTS investigations_workspace_idx  ON investigations(workspace_id);
CREATE INDEX IF NOT EXISTS investigations_created_at_idx ON investigations(created_at);

CREATE TABLE IF NOT EXISTS investigation_follow_ups (
  id               TEXT PRIMARY KEY,
  investigation_id TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investigation_follow_ups_investigation_idx ON investigation_follow_ups(investigation_id);
CREATE INDEX IF NOT EXISTS investigation_follow_ups_created_at_idx    ON investigation_follow_ups(created_at);

CREATE TABLE IF NOT EXISTS investigation_feedback (
  id                   TEXT PRIMARY KEY,
  investigation_id     TEXT NOT NULL REFERENCES investigations(id) ON DELETE CASCADE,
  helpful              BOOLEAN NOT NULL,
  comment              TEXT NULL,
  root_cause_verdict   TEXT NULL,
  hypothesis_feedbacks JSONB NULL,
  action_feedbacks     JSONB NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS investigation_feedback_investigation_idx ON investigation_feedback(investigation_id);
CREATE INDEX IF NOT EXISTS investigation_feedback_created_at_idx    ON investigation_feedback(created_at);

CREATE TABLE IF NOT EXISTS investigation_conclusions (
  investigation_id TEXT PRIMARY KEY REFERENCES investigations(id) ON DELETE CASCADE,
  conclusion       JSONB NOT NULL
);
