/**
 * Org context middleware.
 *
 * Runs after `authn`, before `accesscontrol`. Resolves the current request's
 * org by preference:
 *   1. `X-Openobs-Org-Id` header
 *   2. `?orgId=` query
 *   3. `user.org_id` (set earlier by auth middleware as `req.auth.orgId`)
 *
 * Validates membership via OrgUserRepository and refreshes `req.auth.orgRole`
 * with the role for the resolved org. Returns 403 when the requested org
 * isn't a member org.
 *
 * See docs/auth-perm-design/04-organizations.md §org-context-middleware.
 */

import type { NextFunction, Response } from 'express';
import type { IOrgUserRepository } from '@agentic-obs/common';
import type { AuthenticatedRequest } from './auth.js';

export const ORG_HEADER = 'x-openobs-org-id';

export interface OrgContextMiddlewareDeps {
  orgUsers: IOrgUserRepository;
}

export function createOrgContextMiddleware(deps: OrgContextMiddlewareDeps) {
  return async function orgContextMiddleware(
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (!req.auth) {
      res.status(401).json({ message: 'authentication required' });
      return;
    }

    const headerOrgId = req.headers[ORG_HEADER];
    const explicit =
      (typeof headerOrgId === 'string' && headerOrgId.length > 0 && headerOrgId) ||
      (typeof req.query['orgId'] === 'string'
        ? (req.query['orgId'] as string)
        : undefined);

    const desired = explicit ?? req.auth.orgId;

    // Server admins may list / manage cross-org resources — middleware here
    // still requires SOME orgId resolution; the policy check about "can this
    // endpoint skip org-scoping" belongs to the handler, not here.
    if (!desired) {
      res.status(403).json({ message: 'user is not a member of any org' });
      return;
    }

    const membership = await deps.orgUsers.findMembership(
      desired,
      req.auth.userId,
    );
    if (!membership) {
      // Server admin can still perform cross-org operations, but the
      // request's req.auth.orgId stays at user.orgId for them — we do NOT
      // grant them a pseudo-membership in an org they're not part of.
      if (req.auth.isServerAdmin && !explicit) {
        // Keep req.auth.orgId as-is; orgRole stays 'None'.
        next();
        return;
      }
      res.status(403).json({ message: 'user is not a member of any org' });
      return;
    }

    req.auth.orgId = desired;
    req.auth.orgRole = membership.role;
    next();
  };
}
