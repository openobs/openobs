import { Router } from 'express';
import type { Response, NextFunction } from 'express';
import { SessionStore } from '@agentic-obs/data-layer';
import type { Session } from '@agentic-obs/data-layer';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthenticatedRequest } from '../middleware/auth.js';

export const sessionsRouter = Router();
const store = new SessionStore();

// All session routes require auth
sessionsRouter.use(authMiddleware);

// POST /sessions - create session (always for the authenticated user)
sessionsRouter.post('/', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'authentication required' });
      return;
    }
    const session = store.create(userId);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// GET /sessions - list sessions for the authenticated user
sessionsRouter.get('/', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'authentication required' });
      return;
    }
    const sessions = store.listByUser(userId);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

// GET /sessions/:id - get session by id (ownership check)
sessionsRouter.get('/:id', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'authentication required' });
      return;
    }

    const session = store.get(req.params['id'] ?? '');
    if (!session) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }
    if (session.userId !== userId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'you do not own this session' });
      return;
    }
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// PATCH /sessions/:id - update session (ownership check)
sessionsRouter.patch('/:id', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'authentication required' });
      return;
    }

    const id = req.params['id'] ?? '';
    const existing = store.get(id);
    if (!existing) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'you do not own this session' });
      return;
    }

    const session = store.update(id, req.body as Partial<Session>);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// DELETE /sessions/:id - delete session (ownership check)
sessionsRouter.delete('/:id', (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.auth?.userId;
    if (!userId) {
      res.status(401).json({ code: 'UNAUTHORIZED', message: 'authentication required' });
      return;
    }

    const id = req.params['id'] ?? '';
    const existing = store.get(id);
    if (!existing) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }
    if (existing.userId !== userId) {
      res.status(403).json({ code: 'FORBIDDEN', message: 'you do not own this session' });
      return;
    }

    store.delete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
