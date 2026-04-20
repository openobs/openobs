-- Migration 018: runtime settings key/value table.
--
-- Scope: a lightweight key/value store used for one-shot bootstrap flags such
-- as the T9.1 auth-migration marker (`auth_migrated_v1`) that lets the gateway
-- skip re-running idempotent data migrations on subsequent boots.
--
-- This is NOT a general-purpose config store — instance config lives in
-- the dedicated `instance_llm_config`, `instance_datasources`, and
-- `notification_channels` tables added in migration 019. Only per-install
-- flags that must survive a gateway restart belong here.

CREATE TABLE IF NOT EXISTS _runtime_settings (
  id TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated TEXT NOT NULL
);
