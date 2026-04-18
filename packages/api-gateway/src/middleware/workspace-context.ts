import type { Request } from 'express';

/**
 * Extract the org identifier from a request.
 *
 * Post-T9 cutover: the legacy "workspace" concept is gone — routes either use
 * `req.auth.orgId` (populated by `org-context.ts` + auth middleware) or fall
 * through to the default org for pre-auth paths. This helper remains for the
 * handful of public endpoints that need an org scope before auth resolves,
 * and for integration tests that drive requests without a full auth chain.
 */
export function getOrgId(req: Request): string {
  const authed = (req as Request & { auth?: { orgId?: string } }).auth;
  if (authed?.orgId) return authed.orgId;
  return (req.headers['x-openobs-org-id'] as string)
    ?? (req.query['orgId'] as string)
    ?? 'default';
}

/**
 * @deprecated — legacy alias kept temporarily for tests and out-of-scope
 * callers. New code should call `getOrgId`. Both return the same value; this
 * name will be removed once remaining callers migrate (tracked via the
 * public search in scripts/lint-workspace-id.ts to be added post-cutover).
 */
export const getWorkspaceId = getOrgId;
