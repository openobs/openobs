import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { IInvestigationReportRepository } from '@agentic-obs/data-layer';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

/**
 * Independent investigation report routes — first-class asset API.
 * Reports are also accessible via /dashboards/:id/investigation-report for backward compat.
 */
export function createInvestigationReportRouter(
  store: IInvestigationReportRepository,
): Router {
  const router = Router();
  const requireDashboardRead = (req: Request, res: Response, next: NextFunction): void => {
    requirePermission('dashboard:read')(req as AuthenticatedRequest, res, next);
  };
  const requireDashboardWrite = (req: Request, res: Response, next: NextFunction): void => {
    requirePermission('dashboard:write')(req as AuthenticatedRequest, res, next);
  };

  router.use((req: Request, res: Response, next: NextFunction) => {
    authMiddleware(req as AuthenticatedRequest, res, next);
  });

  // GET /api/investigation-reports — list all reports
  router.get('/', requireDashboardRead, async (_req: Request, res: Response) => {
    const all = await store.findAll();
    res.json(all);
  });

  // GET /api/investigation-reports/by-dashboard/:dashboardId — get reports for a dashboard
  router.get('/by-dashboard/:dashboardId', requireDashboardRead, async (req: Request, res: Response) => {
    const dashboardId = req.params['dashboardId'] ?? '';
    const reports = await store.findByDashboard(dashboardId);
    res.json(reports);
  });

  // GET /api/investigation-reports/:id — get a specific report
  router.get('/:id', requireDashboardRead, async (req: Request, res: Response) => {
    const id = req.params['id'] ?? '';
    const report = await store.findById(id);
    if (!report) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Investigation report not found' } });
      return;
    }
    res.json(report);
  });

  // DELETE /api/investigation-reports/:id — delete a report
  router.delete('/:id', requireDashboardWrite, async (req: Request, res: Response) => {
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
