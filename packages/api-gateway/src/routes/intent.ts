import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { getSetupConfig } from './setup.js';
import type { IGatewayDashboardStore } from '../repositories/types.js';
import { IntentService } from '../services/intent-service.js';

// SSE-streaming intent endpoint.
//
// Flow:
// 1. Classify intent via LLM (stream progress events)
// 2. Execute alert rule; dashboard/investigate -> create workspace
// 3. Send final "done" event with navigation target
//
// The home page stays visible throughout, showing real-time progress.

export function createIntentRouter(dashboardStore: IGatewayDashboardStore): Router {
  const router = Router();
  const intentService = new IntentService(dashboardStore);

  router.post('/', async (req: Request, res: Response, _next: NextFunction) => {
    const body = req.body as { message?: string };
    if (!body?.message || typeof body.message !== 'string' || body.message.trim() === '') {
      res.status(400).json({ code: 'INVALID_INPUT', message: 'message is required' });
      return;
    }

    const message = body.message.trim();
    const config = getSetupConfig();
    if (!config.llm) {
      res.status(503).json({ code: 'LLM_NOT_CONFIGURED', message: 'LLM not configured' });
      return;
    }

    // SSE setup
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const send = (type: string, data: unknown) => {
      res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const result = await intentService.processMessage(message, (progress) => {
        send(progress.type, progress.data);
      });

      send('done', result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      send('error', { message: msg });
    } finally {
      res.end();
    }
  });

  return router;
}
