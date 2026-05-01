import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { FeedItem, IGatewayFeedStore } from '@agentic-obs/data-layer';
import type { AccessControlSurface } from '../services/accesscontrol-holder.js';
import { createFeedRouter } from './feed.js';

const authState = vi.hoisted(() => ({ orgId: 'org_a' }));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = {
      userId: 'user_1',
      orgId: authState.orgId,
      orgRole: 'Admin',
      isServerAdmin: false,
      authenticatedBy: 'session',
    };
    next();
  },
}));

vi.mock('./investigation/sse.js', () => ({
  initSse: (res: any) => {
    res.status(200);
    res.end();
  },
  sendSseEvent: vi.fn(),
  sendSseKeepAlive: vi.fn(),
}));

function item(id: string): FeedItem {
  return {
    id,
    type: 'anomaly_detected',
    title: id,
    summary: id,
    severity: 'high',
    status: 'unread',
    createdAt: '2026-04-30T00:00:00.000Z',
  };
}

function makeStore(): IGatewayFeedStore {
  return {
    list: vi.fn(async () => ({ items: [item('feed_1')], total: 1, page: 1, limit: 20 })),
    get: vi.fn(async (_id, opts) => opts?.tenantId === 'org_a' ? item('feed_1') : undefined),
    markRead: vi.fn(async (_id, opts) => opts?.tenantId === 'org_a' ? { ...item('feed_1'), status: 'read' as const } : undefined),
    markFollowedUp: vi.fn(async (_id, opts) => opts?.tenantId === 'org_a' ? { ...item('feed_1'), followed_up: true } : undefined),
    addFeedback: vi.fn(async (_id, feedback, comment, opts) =>
      opts?.tenantId === 'org_a' ? { ...item('feed_1'), feedback, feedbackComment: comment } : undefined,
    ),
    addHypothesisFeedback: vi.fn(async (_id, feedback, opts) =>
      opts?.tenantId === 'org_a' ? { ...item('feed_1'), hypothesisFeedback: [feedback] } : undefined,
    ),
    addActionFeedback: vi.fn(async (_id, feedback, opts) =>
      opts?.tenantId === 'org_a' ? { ...item('feed_1'), actionFeedback: [feedback] } : undefined,
    ),
    getUnreadCount: vi.fn(async () => 3),
    getStats: vi.fn(async () => ({
      total: 1,
      withFeedback: 0,
      feedbackRate: 0,
      byVerdict: {
        useful: 0,
        not_useful: 0,
        root_cause_correct: 0,
        root_cause_wrong: 0,
        partially_correct: 0,
      },
      hypothesisVerdicts: { correct: 0, wrong: 0 },
      actionVerdicts: { helpful: 0, notHelpful: 0 },
      followedUpCount: 0,
      proactiveHitRate: 0,
    })),
    subscribe: vi.fn(() => vi.fn()),
    add: vi.fn(async () => item('feed_1')),
  };
}

function makeApp(store: IGatewayFeedStore) {
  const accessControl: AccessControlSurface = {
    evaluate: vi.fn(async () => true),
    getUserPermissions: vi.fn(async () => []),
    ensurePermissions: vi.fn(async () => []),
    filterByPermission: vi.fn(async (_identity, items) => [...items]),
  };

  const app = express();
  app.use(express.json());
  app.use('/feed', createFeedRouter({ store, ac: accessControl }));
  return app;
}

describe('feed router tenant scope', () => {
  beforeEach(() => {
    authState.orgId = 'org_a';
    vi.clearAllMocks();
  });

  it('passes the authenticated org as tenant for list, stats, get, and SSE', async () => {
    const store = makeStore();
    const app = makeApp(store);

    await expect(request(app).get('/feed')).resolves.toMatchObject({ status: 200 });
    expect(store.list).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'org_a' }));

    await expect(request(app).get('/feed/stats')).resolves.toMatchObject({ status: 200 });
    expect(store.getStats).toHaveBeenCalledWith({ tenantId: 'org_a' });

    await expect(request(app).get('/feed/feed_1')).resolves.toMatchObject({ status: 200 });
    expect(store.get).toHaveBeenCalledWith('feed_1', { tenantId: 'org_a' });

    await expect(request(app).get('/feed/subscribe')).resolves.toMatchObject({ status: 200 });
    expect(store.getUnreadCount).toHaveBeenCalledWith({ tenantId: 'org_a' });
    expect(store.subscribe).toHaveBeenCalledWith(expect.any(Function), { tenantId: 'org_a' });
  });

  it.each([
    ['post', '/feed/feed_1/read', undefined, 'markRead', 1],
    ['post', '/feed/feed_1/follow-up', undefined, 'markFollowedUp', 1],
    ['post', '/feed/feed_1/feedback', { feedback: 'useful', comment: 'ok' }, 'addFeedback', 3],
    ['post', '/feed/feed_1/action-feedback', { actionId: 'a1', helpful: true }, 'addActionFeedback', 2],
    ['post', '/feed/feed_1/hypothesis-feedback', { hypothesisId: 'h1', verdict: 'correct' }, 'addHypothesisFeedback', 2],
  ] as const)('passes tenant scope for %s %s', async (method, path, body, mutation, scopeArgIndex) => {
    const store = makeStore();
    const app = makeApp(store);
    let req = request(app)[method](path);
    if (body) req = req.send(body);

    await expect(req).resolves.toMatchObject({ status: 200 });
    const call = vi.mocked(store[mutation]).mock.calls[0]!;
    expect(call[scopeArgIndex]).toEqual({ tenantId: 'org_a' });
  });
});
