import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { ApiError } from '@agentic-obs/common';
import { InMemoryApprovalRepository } from '@agentic-obs/data-layer';
import type { IApprovalRepository } from '@agentic-obs/data-layer';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const defaultRepo: IApprovalRepository = new InMemoryApprovalRepository();

export function createApprovalRouter(repo: IApprovalRepository = defaultRepo): Router {
  const router = Router();

  // GET /api/approvals - list pending approvals
  // Requires execution:read (operator, investigator, admin)
  router.get(
    '/',
    authMiddleware,
    requirePermission('execution:read'),
    async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        res.json(await repo.listPending());
      } catch (err) {
        next(err);
      }
    },
  );

  // GET /api/approvals/:id - get single approval request
  // Requires execution:read
  router.get(
    '/:id',
    authMiddleware,
    requirePermission('execution:read'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const record = await repo.findById(req.params['id'] ?? '');
        if (!record) {
          const err: ApiError = { code: 'NOT_FOUND', message: 'Approval request not found' };
          res.status(404).json(err);
          return;
        }
        res.json(record);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/approvals/:id/approve - approve a pending request
  // Requires execution:approve (operator and admin only)
  router.post(
    '/:id/approve',
    authMiddleware,
    requirePermission('execution:approve'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        const id = req.params['id'] ?? '';
        const resolvedBy = authReq.auth?.sub ?? 'unknown';
        const resolvedByRoles = authReq.auth?.roles ?? [];

        const updated = await repo.approve(id, resolvedBy, resolvedByRoles);
        if (!updated) {
          const existing = await repo.findById(id);
          if (!existing) {
            const err: ApiError = { code: 'NOT_FOUND', message: 'Approval request not found' };
            res.status(404).json(err);
            return;
          }

          const err: ApiError = {
            code: 'CONFLICT',
            message: `Approval request is already ${existing.status} and cannot be approved`,
          };
          res.status(409).json(err);
          return;
        }

        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/approvals/:id/reject - reject a pending request
  // Requires execution:approve (operator and admin only)
  router.post(
    '/:id/reject',
    authMiddleware,
    requirePermission('execution:approve'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        const id = req.params['id'] ?? '';
        const resolvedBy = authReq.auth?.sub ?? 'unknown';
        const resolvedByRoles = authReq.auth?.roles ?? [];

        const updated = await repo.reject(id, resolvedBy, resolvedByRoles);
        if (!updated) {
          const existing = await repo.findById(id);
          if (!existing) {
            const err: ApiError = { code: 'NOT_FOUND', message: 'Approval request not found' };
            res.status(404).json(err);
            return;
          }

          const err: ApiError = {
            code: 'CONFLICT',
            message: `Approval request is already ${existing.status} and cannot be rejected`,
          };
          res.status(409).json(err);
          return;
        }

        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  // POST /api/approvals/:id/override - admin override; force-approve regardless of status
  // Requires execution:override (admin only via auth)
  router.post(
    '/:id/override',
    authMiddleware,
    requirePermission('execution:override'),
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        const authReq = req as AuthenticatedRequest;
        const id = req.params['id'] ?? '';
        const resolvedBy = authReq.auth?.sub ?? 'unknown';
        const resolvedByRoles = authReq.auth?.roles ?? [];

        const updated = await repo.override(id, resolvedBy, resolvedByRoles);
        if (!updated) {
          const err: ApiError = { code: 'NOT_FOUND', message: 'Approval request not found' };
          res.status(404).json(err);
          return;
        }

        res.json(updated);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}

export const approvalRouter = createApprovalRouter();
