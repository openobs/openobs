-- Migration 016: drop the legacy `workspaces` table.
--
-- See docs/auth-perm-design/10-migration-plan.md §T4.5 and
-- docs/auth-perm-design/04-organizations.md §workspace-to-org-rename.
--
-- Workspaces were the pre-Grafana-parity tenancy concept. Migration 001
-- seeded the new `org` table with a singleton 'org_main' row; migration
-- 015 added `org_id TEXT NOT NULL DEFAULT 'org_main'` to every resource
-- table. All active code now reads the `org` table for tenancy. The
-- workspaces table has no remaining readers.
--
-- Existing `workspace_id` / `tenant_id` columns on resource tables are
-- intentionally kept in place for historical audit / rollback window;
-- they are dropped in Wave 6 cleanup (see 10-migration-plan.md §T9.6).
-- [openobs-deviation] Workspace data is not preserved — the openobs
-- tenancy model was reset during the Grafana-parity migration; operators
-- running a pre-parity build must export workspace contents before
-- upgrading.

DROP TABLE IF EXISTS workspaces;
