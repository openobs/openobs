import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { IInvestigationReportRepository } from '@agentic-obs/data-layer';
import { ac, ACTIONS } from '@agentic-obs/common';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { createRequirePermission } from '../middleware/require-permission.js';
import type { AccessControlSurface } from '../services/accesscontrol-holder.js';

export interface InvestigationReportRouterDeps {
  store: IInvestigationReportRepository;
  /**
   * RBAC surface. Investigation reports are derivative of investigations
   * proper, so reads gate on `investigations:read` and deletes on
   * `investigations:write`. Holder forwards to the real service once auth
   * subsystem finishes wiring.
   */
  ac: AccessControlSurface;
}

/**
 * Independent investigation report routes — first-class asset API.
 * Reports are also accessible via /dashboards/:id/investigation-report for backward compat.
 */
export function createInvestigationReportRouter(
  deps: InvestigationReportRouterDeps,
): Router {
  const store = deps.store;
  const router = Router();
  const requirePermission = createRequirePermission(deps.ac);
  const requireRead = requirePermission(() => ac.eval(ACTIONS.InvestigationsRead, 'investigations:*'));
  const requireWrite = requirePermission(() => ac.eval(ACTIONS.InvestigationsWrite, 'investigations:*'));

  router.use((req: Request, res: Response, next: NextFunction) => {
    authMiddleware(req as AuthenticatedRequest, res, next);
  });

  // GET /api/investigation-reports — list all reports
  router.get('/', requireRead, async (_req: Request, res: Response) => {
    const all = await store.findAll();
    res.json(all);
  });

  // GET /api/investigation-reports/by-dashboard/:dashboardId — get reports for a dashboard
  router.get('/by-dashboard/:dashboardId', requireRead, async (req: Request, res: Response) => {
    const dashboardId = req.params['dashboardId'] ?? '';
    const reports = await store.findByDashboard(dashboardId);
    res.json(reports);
  });

  // GET /api/investigation-reports/:id — get a specific report
  router.get('/:id', requireRead, async (req: Request, res: Response) => {
    const id = req.params['id'] ?? '';
    const report = await store.findById(id);
    if (!report) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Investigation report not found' } });
      return;
    }
    res.json(report);
  });

  // DELETE /api/investigation-reports/:id — delete a report
  router.delete('/:id', requireWrite, async (req: Request, res: Response) => {
    const id = req.params['id'] ?? '';
    const deleted = await store.delete(id);
    if (!deleted) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Investigation report not found' } });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
