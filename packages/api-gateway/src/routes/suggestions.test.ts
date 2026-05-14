/**
 * Integration tests for /api/suggestions.
 *
 * Auth middleware is stubbed so we can drive the router with a fixed
 * identity and exercise the end-to-end repo + handler dispatch.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { InMemoryAiSuggestionRepository } from '../../../data-layer/src/repository/memory/ai-suggestion.js';
import { createSuggestionsRouter } from './suggestions.js';
import type { SuggestionGenerator } from '../services/suggestion-generators.js';

const authState = vi.hoisted(() => ({ orgId: 'org_a', userId: 'user_a' }));

vi.mock('../middleware/auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.auth = {
      userId: authState.userId,
      orgId: authState.orgId,
      orgRole: 'Editor',
      isServerAdmin: false,
      authenticatedBy: 'session',
    };
    next();
  },
}));

function makeApp(generators: SuggestionGenerator[] = []) {
  const repo = new InMemoryAiSuggestionRepository();
  const audit = { log: vi.fn(async () => undefined) } as any;
  const app = express();
  app.use(express.json());
  app.use(
    '/api/suggestions',
    createSuggestionsRouter({
      repo,
      generators,
      generatorDeps: {
        dashboards: {} as any,
        alertRules: {} as any,
      },
      actionDeps: {},
      audit,
    }),
  );
  return { app, repo, audit };
}

describe('/api/suggestions integration', () => {
  beforeEach(() => {
    authState.orgId = 'org_a';
    authState.userId = 'user_a';
    vi.clearAllMocks();
  });

  it('GET returns generated + previously stored suggestions and excludes future-snoozed rows', async () => {
    // Seed a generator that always proposes one row (idempotent via dedup_key).
    const gen: SuggestionGenerator = {
      kind: 'missing_dashboard',
      generate: async (ctx) => [
        {
          orgId: ctx.orgId,
          userId: ctx.userId,
          kind: 'missing_dashboard',
          title: 'Test',
          body: 'Body',
          dedupKey: 'gen:1',
        },
      ],
    };
    const { app, repo } = makeApp([gen]);

    // First call seeds the row.
    let res = await request(app).get('/api/suggestions');
    expect(res.status).toBe(200);
    expect(res.body.data.suggestions).toHaveLength(1);

    // Snooze that row to the far future.
    const id = res.body.data.suggestions[0].id;
    res = await request(app)
      .post(`/api/suggestions/${id}/snooze`)
      .send({ days: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data.suggestion.state).toBe('snoozed');

    // GET should now exclude it (snoozed_until is 7 days in the future).
    res = await request(app).get('/api/suggestions');
    // Generator re-ran but the dedup_key matched an existing row — no new row.
    // The existing row is snoozed to the future, so it's hidden.
    expect(res.body.data.suggestions).toHaveLength(0);

    // Verify state directly via repo.
    const row = await repo.findById(id);
    expect(row?.state).toBe('snoozed');
    expect(row?.snoozedUntil).toBeTruthy();
  });

  it('snooze → snoozed_until passes → row resurfaces', async () => {
    const { app, repo } = makeApp([]);
    const seeded = await repo.create({
      orgId: 'org_a', userId: 'user_a', kind: 'stale_draft',
      title: '', body: '', dedupKey: 'k',
    });

    // Snooze the row 7d.
    let res = await request(app)
      .post(`/api/suggestions/${seeded.id}/snooze`)
      .send({ days: 7 });
    expect(res.status).toBe(200);

    // While still snoozed, not visible.
    res = await request(app).get('/api/suggestions');
    expect(res.body.data.suggestions).toHaveLength(0);

    // Simulate elapsed snooze by rewriting the row.
    await repo.updateState(seeded.id, 'snoozed', '2000-01-01T00:00:00.000Z');

    res = await request(app).get('/api/suggestions');
    expect(res.body.data.suggestions).toHaveLength(1);
  });

  it('dismiss is terminal — row stays hidden', async () => {
    const { app, repo } = makeApp([]);
    const s = await repo.create({
      orgId: 'org_a', userId: 'user_a', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'k',
    });
    const res = await request(app).post(`/api/suggestions/${s.id}/dismiss`);
    expect(res.status).toBe(200);
    expect(res.body.data.suggestion.state).toBe('dismissed');

    const list = await request(app).get('/api/suggestions');
    expect(list.body.data.suggestions).toHaveLength(0);
  });

  it('snooze-all snoozes only the current user/org open rows', async () => {
    const { app, repo } = makeApp([]);
    await repo.create({
      orgId: 'org_a', userId: 'user_a', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'k1',
    });
    await repo.create({
      orgId: 'org_a', userId: 'user_a', kind: 'stale_draft',
      title: '', body: '', dedupKey: 'k2',
    });
    // Different user — must not be touched.
    await repo.create({
      orgId: 'org_a', userId: 'other', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'k1',
    });

    const res = await request(app)
      .post('/api/suggestions/snooze-all')
      .send({ days: 7 });
    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(2);

    const list = await repo.findOpenForUser('other', 'org_a');
    expect(list).toHaveLength(1);
  });

  it('rejects ownership-mismatched suggestion modifications with 403', async () => {
    const { app, repo } = makeApp([]);
    const otherRow = await repo.create({
      orgId: 'org_a', userId: 'other', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'k',
    });
    const res = await request(app).post(`/api/suggestions/${otherRow.id}/dismiss`);
    expect(res.status).toBe(403);
  });

  it('rejects invalid snooze days', async () => {
    const { app, repo } = makeApp([]);
    const s = await repo.create({
      orgId: 'org_a', userId: 'user_a', kind: 'missing_dashboard',
      title: '', body: '', dedupKey: 'k',
    });
    const res = await request(app)
      .post(`/api/suggestions/${s.id}/snooze`)
      .send({ days: 3 });
    expect(res.status).toBe(400);
  });
});
