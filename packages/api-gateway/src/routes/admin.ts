/**
 * Server-admin routes (/api/admin/*).
 *
 * This file is a thin read-only harness that will be fleshed out in Wave 3
 * (T4.1 org CRUD) and Wave 4 (T6 service accounts). For T2 we only need:
 *   - GET /api/admin/users        (list, limited)
 *   - GET /api/admin/audit-log    (query audit_log)
 * Everything else returns 501 with a pointer to the owning task.
 *
 * Earlier code paths that reached into the now-deleted in-memory userStore
 * are removed outright (no back-compat shims per §99).
 */

import { Router, type Request, type Response } from 'express';
import type {
  IAuditLogRepository,
  IUserAuthTokenRepository,
  IUserRepository,
} from '@agentic-obs/common';
import { AuditAction } from '@agentic-obs/common';
import type { AuditWriter } from '../auth/audit-writer.js';
import type { SessionService } from '../auth/session-service.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export interface AdminRouterDeps {
  users: IUserRepository;
  userAuthTokens: IUserAuthTokenRepository;
  auditLog: IAuditLogRepository;
  sessions: SessionService;
  audit: AuditWriter;
}

function requireServerAdmin(
  req: AuthenticatedRequest,
  res: Response,
): boolean {
  if (!req.auth) {
    res.status(401).json({ message: 'authentication required' });
    return false;
  }
  if (!req.auth.isServerAdmin) {
    res.status(403).json({ message: 'server admin required' });
    return false;
  }
  return true;
}

export function createAdminRouter(deps: AdminRouterDeps): Router {
  const router = Router();

  router.get('/users', async (req: AuthenticatedRequest, res: Response) => {
    if (!requireServerAdmin(req, res)) return;
    const perpage = Math.min(
      parseInt((req.query['perpage'] as string | undefined) ?? '100', 10),
      500,
    );
    const page = Math.max(
      parseInt((req.query['page'] as string | undefined) ?? '1', 10),
      1,
    );
    const search =
      typeof req.query['query'] === 'string'
        ? (req.query['query'] as string)
        : undefined;
    const { items, total } = await deps.users.list({
      limit: perpage,
      offset: (page - 1) * perpage,
      search,
    });
    res.json({
      totalCount: total,
      users: items.map((u) => ({
        id: u.id,
        email: u.email,
        login: u.login,
        name: u.name,
        isAdmin: u.isAdmin,
        isDisabled: u.isDisabled,
        isServiceAccount: u.isServiceAccount,
        created: u.created,
        updated: u.updated,
        lastSeenAt: u.lastSeenAt,
      })),
      page,
      perPage: perpage,
    });
  });

  router.post(
    '/users/:userId/disable',
    async (req: AuthenticatedRequest, res: Response) => {
      if (!requireServerAdmin(req, res)) return;
      const id = req.params['userId'] ?? '';
      await deps.users.setDisabled(id, true);
      // Revoke any live sessions so a disabled user can't ride out an
      // existing cookie. This is part of the `user.disabled` contract per
      // §02 §retry-semantics.
      await deps.sessions.revokeAllForUser(id);
      void deps.audit.log({
        action: AuditAction.UserDisabled,
        actorType: 'user',
        actorId: req.auth!.userId,
        targetType: 'user',
        targetId: id,
        outcome: 'success',
      });
      res.json({ message: 'user disabled' });
    },
  );

  router.post(
    '/users/:userId/enable',
    async (req: AuthenticatedRequest, res: Response) => {
      if (!requireServerAdmin(req, res)) return;
      const id = req.params['userId'] ?? '';
      await deps.users.setDisabled(id, false);
      void deps.audit.log({
        action: AuditAction.UserEnabled,
        actorType: 'user',
        actorId: req.auth!.userId,
        targetType: 'user',
        targetId: id,
        outcome: 'success',
      });
      res.json({ message: 'user enabled' });
    },
  );

  router.post(
    '/users/:userId/logout',
    async (req: AuthenticatedRequest, res: Response) => {
      if (!requireServerAdmin(req, res)) return;
      const id = req.params['userId'] ?? '';
      const n = await deps.sessions.revokeAllForUser(id);
      void deps.audit.log({
        action: AuditAction.SessionRevoked,
        actorType: 'user',
        actorId: req.auth!.userId,
        targetType: 'user',
        targetId: id,
        outcome: 'success',
        metadata: { revoked: n },
      });
      res.json({ message: 'sessions revoked', revoked: n });
    },
  );

  router.get(
    '/audit-log',
    async (req: AuthenticatedRequest, res: Response) => {
      if (!requireServerAdmin(req, res)) return;
      const perpage = Math.min(
        parseInt((req.query['perpage'] as string | undefined) ?? '100', 10),
        500,
      );
      const page = Math.max(
        parseInt((req.query['page'] as string | undefined) ?? '1', 10),
        1,
      );
      const { items, total } = await deps.auditLog.query({
        limit: perpage,
        offset: (page - 1) * perpage,
        action: req.query['action'] as string | undefined,
        actorId: req.query['actorId'] as string | undefined,
        targetId: req.query['targetId'] as string | undefined,
        outcome: req.query['outcome'] as 'success' | 'failure' | undefined,
        from: req.query['from'] as string | undefined,
        to: req.query['to'] as string | undefined,
      });
      res.json({ items, total, page, perpage });
    },
  );

  // Bare GET /api/admin/stats — placeholder for T9 stats. Returns a minimal
  // shape so frontend queries don't crash.
  router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
    if (!requireServerAdmin(req, res)) return;
    const { total: userCount } = await deps.users.list({ limit: 1 });
    res.json({ userCount });
  });

  // Lingering admin endpoints not owned by T2 — return 501 with a pointer so
  // the frontend can detect "not yet implemented" and not crash.
  router.all('/*', (_req: Request, res: Response) => {
    res.status(501).json({
      message:
        'not implemented yet — see docs/auth-perm-design/08-api-surface.md',
    });
  });

  return router;
}
