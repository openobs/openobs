import { Router } from 'express';
import type { Request, Response } from 'express';

export const healthRouter = Router();

// Pipeline running state - updated by proactive-pipeline-runner after start
let pipelineRunning = false;
export function setPipelineRunning(value: boolean): void {
  pipelineRunning = value;
}

const startedAt = Date.now();

type CheckStatus = 'ok' | 'fail' | 'skip';

interface CheckResult {
  status: CheckStatus;
  message?: string;
}

interface ReadyResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    db: CheckResult;
    redis: CheckResult;
    llm: CheckResult;
    proactive: CheckResult;
  };
  timestamp: string;
}

function checkLlm(): CheckResult {
  const apiKey
    = process.env['ANTHROPIC_API_KEY']
      ?? process.env['OPENAI_API_KEY']
      ?? process.env['LLM_API_KEY'];
  if (!apiKey)
    return { status: 'fail', message: 'No LLM API key configured' };
  return { status: 'ok', message: 'API key present' };
}

function checkProactive(): CheckResult {
  return pipelineRunning
    ? { status: 'ok' }
    : { status: 'fail', message: 'Proactive pipeline not running' };
}

// GET /api/health/live - K8s liveness probe (simple alive check)
healthRouter.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

// GET /api/health/startup - K8s startup probe (ready after brief warm-up)
healthRouter.get('/startup', (_req: Request, res: Response) => {
  const uptimeMs = Date.now() - startedAt;
  const WARM_UP_MS = 10_000;
  if (uptimeMs >= WARM_UP_MS) {
    res.json({ status: 'started', uptimeMs });
  }
  else {
    res.status(503).json({ status: 'starting', uptimeMs });
  }
});

// GET /api/health/ready - K8s readiness probe (deep dependency check)
healthRouter.get('/ready', (_req: Request, res: Response) => {
  // DB and Redis are not configured in this deployment (in-memory stores)
  const db: CheckResult = { status: 'skip', message: 'No DB configured' };
  const redis: CheckResult = { status: 'skip', message: 'No Redis configured' };
  const llm = checkLlm();
  const proactive = checkProactive();

  const checks = { db, redis, llm, proactive };

  // LLM is critical - without it the agent cannot investigate
  // Proactive pipeline failure is soft - reactive investigation still works
  let status: ReadyResponse['status'];
  if (llm.status === 'fail') {
    status = 'unhealthy';
  }
  else if (proactive.status === 'fail') {
    status = 'degraded';
  }
  else {
    status = 'healthy';
  }

  const httpStatus = status === 'unhealthy' ? 503 : 200;
  res.status(httpStatus).json({
    status,
    checks,
    timestamp: new Date().toISOString(),
  } satisfies ReadyResponse);
});

// GET /api/health - backward-compatible root check
healthRouter.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});
