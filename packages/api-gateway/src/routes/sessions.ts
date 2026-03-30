import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { SessionStore } from '@agentic-obs/data-layer';
import type { Session } from '@agentic-obs/data-layer'; // used in update body type
import { authMiddleware } from '../middleware/auth.js';

export const sessionsRouter = Router();
const store = new SessionStore();

// All session routes require auth
sessionsRouter.use(authMiddleware);

// POST /sessions - create session
sessionsRouter.post('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { userId?: unknown };
    if (!body.userId || typeof body.userId !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'userId is required' });
      return;
    }
    const session = store.create(body.userId);
    res.status(201).json(session);
  } catch (err) {
    next(err);
  }
});

// GET /sessions?userId=... - list sessions by userId (userId is required)
sessionsRouter.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.query['userId'];
    if (!userId || typeof userId !== 'string') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'userId query param is required' });
      return;
    }
    const sessions = store.listByUser(userId);
    res.json(sessions);
  } catch (err) {
    next(err);
  }
});

// GET /sessions/:id - get session by id
sessionsRouter.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const session = store.get(req.params['id'] ?? '');
    if (!session) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// PATCH /sessions/:id - update session
sessionsRouter.patch('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] ?? '';
    const existing = store.get(id);
    if (!existing) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }

    const session = store.update(id, req.body as Partial<Session>);
    res.json(session);
  } catch (err) {
    next(err);
  }
});

// DELETE /sessions/:id - delete session
sessionsRouter.delete('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] ?? '';
    const existing = store.get(id);
    if (!existing) {
      res.status(404).json({ code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }

    store.delete(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
