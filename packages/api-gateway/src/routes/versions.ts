import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { AssetType } from '@agentic-obs/common';
import type { IVersionRepository } from '@agentic-obs/data-layer';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';

const VALID_ASSET_TYPES: AssetType[] = ['dashboard', 'alert_rule', 'investigation_report'];

function isValidAssetType(value: string): value is AssetType {
  return (VALID_ASSET_TYPES as string[]).includes(value);
}

export function createVersionRouter(store: IVersionRepository): Router {
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

  // GET /api/versions/:assetType/:assetId - list version history
  router.get('/:assetType/:assetId', requireDashboardRead, async (req: Request, res: Response) => {
    const assetType = req.params['assetType'] as string;
    const assetId = req.params['assetId'] as string;
    if (!isValidAssetType(assetType)) {
      res.status(400).json({ error: { code: 'INVALID_ASSET_TYPE', message: `Invalid asset type: ${assetType}` } });
      return;
    }
    const history = await store.getHistory(assetType, assetId);
    res.json({ versions: history });
  });

  // POST /api/versions/:assetType/:assetId/rollback - rollback to a version
  router.post('/:assetType/:assetId/rollback', requireDashboardWrite, async (req: Request, res: Response) => {
    const assetType = req.params['assetType'] as string;
    const assetId = req.params['assetId'] as string;
    if (!isValidAssetType(assetType)) {
      res.status(400).json({ error: { code: 'INVALID_ASSET_TYPE', message: `Invalid asset type: ${assetType}` } });
      return;
    }
    const body = req.body as { version?: number };
    if (typeof body?.version !== 'number' || body.version < 1) {
      res.status(400).json({ error: { code: 'INVALID_VERSION', message: 'body.version must be a positive integer' } });
      return;
    }
    const snapshot = await store.rollback(assetType, assetId, body.version);
    if (snapshot === undefined) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
      return;
    }
    res.json({ snapshot });
  });

  // GET /api/versions/:assetType/:assetId/:version - get specific version
  router.get('/:assetType/:assetId/:version', requireDashboardRead, async (req: Request, res: Response) => {
    const assetType = req.params['assetType'] as string;
    const assetId = req.params['assetId'] as string;
    const versionStr = req.params['version'] as string;
    if (!isValidAssetType(assetType)) {
      res.status(400).json({ error: { code: 'INVALID_ASSET_TYPE', message: `Invalid asset type: ${assetType}` } });
      return;
    }
    const version = parseInt(versionStr, 10);
    if (isNaN(version) || version < 1) {
      res.status(400).json({ error: { code: 'INVALID_VERSION', message: 'version must be a positive integer' } });
      return;
    }
    const entry = await store.getVersion(assetType, assetId, version);
    if (!entry) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Version not found' } });
      return;
    }
    res.json(entry);
  });

  return router;
}
