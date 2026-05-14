/**
 * /api/suggestions — AI Suggestions inbox (Wave 2 / step 3).
 *
 * REST surface:
 *   GET    /api/suggestions
 *   POST   /api/suggestions/:id/accept
 *   POST   /api/suggestions/:id/snooze    body: { days: 1 | 7 }
 *   POST   /api/suggestions/:id/dismiss
 *   POST   /api/suggestions/snooze-all    body: { days: 7 }
 *
 * On GET, every registered SuggestionGenerator runs and upserts its
 * proposals via the repository (dedup_key idempotent). The response is
 * then the user's currently-visible inbox (open + resurfaced-snoozed).
 *
 * Auth: every endpoint is gated by authMiddleware. Suggestions are
 * per-user — the repository scopes by (userId, orgId).
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import {
  AuditAction,
  type IAiSuggestionRepository,
  type AiSuggestion,
  type Identity,
} from '@agentic-obs/common';
import type { AuthenticatedRequest } from '../middleware/auth.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuditWriter } from '../auth/audit-writer.js';
import type { SuggestionGenerator, GeneratorCtx } from '../services/suggestion-generators.js';
import {
  dispatchSuggestionAction,
  type ActionHandlerDeps,
  type ActionResult,
} from '../services/suggestion-action-handlers.js';

export interface SuggestionsRouterDeps {
  repo: IAiSuggestionRepository;
  generators: SuggestionGenerator[];
  generatorDeps: Omit<GeneratorCtx, 'orgId' | 'userId'>;
  actionDeps: ActionHandlerDeps;
  audit: AuditWriter;
}

function snoozeUntilFromDays(days: number, now: number = Date.now()): string {
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

function getIdentity(req: Request): Identity | null {
  const auth = (req as AuthenticatedRequest).auth;
  return auth ?? null;
}

function bad(res: Response, message: string, code = 'VALIDATION'): void {
  res.status(400).json({ error: { code, message } });
}

function notFound(res: Response): void {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'suggestion not found' } });
}

function forbidden(res: Response): void {
  res.status(403).json({ error: { code: 'FORBIDDEN', message: 'not your suggestion' } });
}

async function loadOwned(
  repo: IAiSuggestionRepository,
  id: string,
  identity: Identity,
): Promise<AiSuggestion | null | 'forbidden'> {
  const row = await repo.findById(id);
  if (!row) return null;
  if (row.userId !== identity.userId || row.orgId !== identity.orgId) {
    return 'forbidden';
  }
  return row;
}

export function createSuggestionsRouter(deps: SuggestionsRouterDeps): Router {
  const router = Router();
  router.use(authMiddleware);

  // GET /api/suggestions — runs generators (idempotent via dedup_key),
  // then returns the user's currently-visible inbox.
  router.get('/', async (req, res) => {
    const id = getIdentity(req);
    if (!id) return bad(res, 'unauthenticated', 'UNAUTHENTICATED');

    const ctx: GeneratorCtx = {
      orgId: id.orgId,
      userId: id.userId,
      ...deps.generatorDeps,
    };
    // Run generators sequentially — they query the same repos and the
    // total volume is tiny. Errors in one generator must not blow up the
    // whole inbox.
    for (const g of deps.generators) {
      try {
        const proposals = await g.generate(ctx);
        for (const p of proposals) {
          await deps.repo.create(p);
        }
      } catch {
        // Swallow — the inbox should still render with whatever ran.
      }
    }

    const list = await deps.repo.findOpenForUser(id.userId, id.orgId);
    res.json({ data: { suggestions: list } });
    return;
  });

  // POST /api/suggestions/:id/accept
  router.post('/:id/accept', async (req, res) => {
    const id = getIdentity(req);
    if (!id) return bad(res, 'unauthenticated', 'UNAUTHENTICATED');
    const rowId = req.params['id'] ?? '';
    const row = await loadOwned(deps.repo, rowId, id);
    if (row === null) return notFound(res);
    if (row === 'forbidden') return forbidden(res);

    let actionResult: ActionResult | null = null;
    if (row.actionKind) {
      actionResult = await dispatchSuggestionAction(
        row.actionKind,
        row.actionPayload ?? {},
        deps.actionDeps,
      );
    }
    const updated = await deps.repo.updateState(row.id, 'accepted');
    void deps.audit.log({
      action: AuditAction.SuggestionAccepted,
      actorType: 'user',
      actorId: id.userId,
      orgId: id.orgId,
      targetType: 'ai_suggestion',
      targetId: row.id,
      targetName: row.kind,
      outcome: 'success',
      metadata: { actionKind: row.actionKind, result: actionResult },
    });
    res.json({ data: { suggestion: updated, action: actionResult } });
    return;
  });

  // POST /api/suggestions/:id/snooze  body: { days: 1 | 7 }
  router.post('/:id/snooze', async (req, res) => {
    const id = getIdentity(req);
    if (!id) return bad(res, 'unauthenticated', 'UNAUTHENTICATED');
    const days = Number((req.body ?? {}).days);
    if (days !== 1 && days !== 7) {
      return bad(res, 'days must be 1 or 7');
    }
    const rowId = req.params['id'] ?? '';
    const row = await loadOwned(deps.repo, rowId, id);
    if (row === null) return notFound(res);
    if (row === 'forbidden') return forbidden(res);

    const snoozedUntil = snoozeUntilFromDays(days);
    const updated = await deps.repo.updateState(row.id, 'snoozed', snoozedUntil);
    void deps.audit.log({
      action: AuditAction.SuggestionSnoozed,
      actorType: 'user',
      actorId: id.userId,
      orgId: id.orgId,
      targetType: 'ai_suggestion',
      targetId: row.id,
      targetName: row.kind,
      outcome: 'success',
      metadata: { days, snoozedUntil },
    });
    res.json({ data: { suggestion: updated } });
    return;
  });

  // POST /api/suggestions/:id/dismiss
  router.post('/:id/dismiss', async (req, res) => {
    const id = getIdentity(req);
    if (!id) return bad(res, 'unauthenticated', 'UNAUTHENTICATED');
    const rowId = req.params['id'] ?? '';
    const row = await loadOwned(deps.repo, rowId, id);
    if (row === null) return notFound(res);
    if (row === 'forbidden') return forbidden(res);

    const updated = await deps.repo.updateState(row.id, 'dismissed');
    void deps.audit.log({
      action: AuditAction.SuggestionDismissed,
      actorType: 'user',
      actorId: id.userId,
      orgId: id.orgId,
      targetType: 'ai_suggestion',
      targetId: row.id,
      targetName: row.kind,
      outcome: 'success',
    });
    res.json({ data: { suggestion: updated } });
    return;
  });

  // POST /api/suggestions/snooze-all  body: { days: 7 }
  router.post('/snooze-all', async (req, res) => {
    const id = getIdentity(req);
    if (!id) return bad(res, 'unauthenticated', 'UNAUTHENTICATED');
    const days = Number((req.body ?? {}).days ?? 7);
    if (days !== 1 && days !== 7) {
      return bad(res, 'days must be 1 or 7');
    }
    const snoozedUntil = snoozeUntilFromDays(days);
    const count = await deps.repo.snoozeAllForUser(id.userId, id.orgId, snoozedUntil);
    void deps.audit.log({
      action: AuditAction.SuggestionSnoozed,
      actorType: 'user',
      actorId: id.userId,
      orgId: id.orgId,
      targetType: 'ai_suggestion',
      targetId: null,
      targetName: 'all',
      outcome: 'success',
      metadata: { bulk: true, count, days, snoozedUntil },
    });
    res.json({ data: { count, snoozedUntil } });
    return;
  });

  return router;
}
