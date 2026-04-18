import type { Request } from 'express';

/**
 * Extract the legacy "workspace" identifier from a request.
 *
 * Deprecated — this predates the Grafana-parity multi-org model. New
 * org-aware routes should use `req.auth.orgId` populated by the
 * `org-context.ts` middleware instead, and query resource tables on
 * `org_id` (T1 migration 015 already added that column). This helper
 * is kept so the pre-T4 resource handlers (alert-rules, dashboard,
 * investigation) continue compiling during the Wave 3 → Wave 6 cutover.
 *
 * Rolling those handlers onto `org_id` is tracked by
 * docs/auth-perm-design/10-migration-plan.md §T9.6 cleanup.
 */
export function getWorkspaceId(req: Request): string {
  // Priority: auth-resolved org > explicit header > query > default.
  const authed = (req as Request & { auth?: { orgId?: string } }).auth;
  if (authed?.orgId) return authed.orgId;
  return (req.headers['x-openobs-org-id'] as string)
    ?? (req.headers['x-workspace-id'] as string)
    ?? (req.query['orgId'] as string)
    ?? (req.query['workspaceId'] as string)
    ?? 'default';
}

/** Preferred name going forward — same implementation. */
export const getOrgId = getWorkspaceId;
