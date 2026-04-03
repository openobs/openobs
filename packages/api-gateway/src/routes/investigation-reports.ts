import { Router } from 'express';
import type { Request, Response } from 'express';
import { defaultInvestigationReportStore } from '@agentic-obs/data-layer';

/**
 * Independent investigation report routes — first-class asset API.
 * Reports are also accessible via /dashboards/:id/investigation-report for backward compat.
 */
export function createInvestigationReportRouter(): Router {
  const router = Router();

  // GET /api/investigation-reports — list all reports
  router.get('/', (_req: Request, res: Response) => {
    const all = defaultInvestigationReportStore.findAll();
    res.json(all);
  });

  // GET /api/investigation-reports/:id — get a specific report
  router.get('/:id', (req: Request, res: Response) => {
    const id = req.params['id'] ?? '';
    const report = defaultInvestigationReportStore.findById(id);
    if (!report) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Investigation report not found' });
      return;
    }
    res.json(report);
  });

  // GET /api/investigation-reports/by-dashboard/:dashboardId — get reports for a dashboard
  router.get('/by-dashboard/:dashboardId', (req: Request, res: Response) => {
    const dashboardId = req.params['dashboardId'] ?? '';
    const reports = defaultInvestigationReportStore.findByDashboard(dashboardId);
    res.json(reports);
  });

  // DELETE /api/investigation-reports/:id — delete a report
  router.delete('/:id', (req: Request, res: Response) => {
    const id = req.params['id'] ?? '';
    const deleted = defaultInvestigationReportStore.delete(id);
    if (!deleted) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Investigation report not found' });
      return;
    }
    res.json({ ok: true });
  });

  return router;
}
