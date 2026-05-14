/**
 * Generator unit tests — seeded fakes for IDashboardRepository and
 * IAlertRuleRepository. We only stub the methods each generator actually
 * calls.
 */

import { describe, expect, it } from 'vitest';
import {
  DuplicateDashboardSuggestionGenerator,
  MissingDashboardSuggestionGenerator,
  StaleDraftSuggestionGenerator,
  type GeneratorCtx,
} from './suggestion-generators.js';

// -- Minimal fake repos (typed loosely on purpose — the generator only
//    touches a tiny part of each surface). -------------------------------

function fakeDashboards(rows: any[]) {
  return {
    findAll: async (userId?: string) =>
      userId ? rows.filter((r) => r.userId === userId) : rows,
  } as any;
}

function fakeAlertRules(list: any[]) {
  return {
    findAll: async () => ({ list, total: list.length }),
  } as any;
}

function ctx(over: Partial<GeneratorCtx>): GeneratorCtx {
  return {
    orgId: 'org_a',
    userId: 'user_a',
    dashboards: fakeDashboards([]),
    alertRules: fakeAlertRules([]),
    ...over,
  };
}

// -- MissingDashboardSuggestionGenerator --------------------------------

describe('MissingDashboardSuggestionGenerator', () => {
  const gen = new MissingDashboardSuggestionGenerator();

  it('proposes when an alert exists but no dashboard mentions it', async () => {
    const out = await gen.generate(
      ctx({
        alertRules: fakeAlertRules([
          { id: 'rule1', name: 'ingress-gateway', originalPrompt: 'prompt' },
        ]),
        dashboards: fakeDashboards([
          { id: 'd1', title: 'Unrelated', panels: [] },
        ]),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('missing_dashboard');
    expect(out[0]?.actionKind).toBe('create_dashboard');
    expect(out[0]?.dedupKey).toBe('missing_dashboard:rule1');
    expect(out[0]?.title).toContain('ingress-gateway');
  });

  it('skips when a dashboard already mentions the alert name', async () => {
    const out = await gen.generate(
      ctx({
        alertRules: fakeAlertRules([{ id: 'rule1', name: 'ingress-gateway' }]),
        dashboards: fakeDashboards([
          { id: 'd1', title: 'Ingress-Gateway Overview', panels: [] },
        ]),
      }),
    );
    expect(out).toHaveLength(0);
  });
});

// -- StaleDraftSuggestionGenerator --------------------------------------

describe('StaleDraftSuggestionGenerator', () => {
  const gen = new StaleDraftSuggestionGenerator();
  const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
  const recent = new Date().toISOString();

  it('proposes when personal-folder dashboards are stale', async () => {
    const out = await gen.generate(
      ctx({
        dashboards: fakeDashboards([
          { id: 'd1', userId: 'user_a', folder: undefined, updatedAt: old, createdAt: old, panels: [] },
          { id: 'd2', userId: 'user_a', folder: undefined, updatedAt: old, createdAt: old, panels: [] },
        ]),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('stale_draft');
    expect(out[0]?.actionKind).toBe('archive_resources');
    const ids = (out[0]?.actionPayload as { resourceIds: string[] }).resourceIds;
    expect(ids.sort()).toEqual(['d1', 'd2']);
    expect(out[0]?.dedupKey).toBe('stale_draft:user_a');
  });

  it('skips when nothing is stale enough', async () => {
    const out = await gen.generate(
      ctx({
        dashboards: fakeDashboards([
          { id: 'd1', userId: 'user_a', folder: undefined, updatedAt: recent, createdAt: recent, panels: [] },
        ]),
      }),
    );
    expect(out).toHaveLength(0);
  });

  it('ignores dashboards in shared folders', async () => {
    const out = await gen.generate(
      ctx({
        dashboards: fakeDashboards([
          { id: 'd1', userId: 'user_a', folder: 'team-x', updatedAt: old, createdAt: old, panels: [] },
        ]),
      }),
    );
    expect(out).toHaveLength(0);
  });
});

// -- DuplicateDashboardSuggestionGenerator -----------------------------

describe('DuplicateDashboardSuggestionGenerator', () => {
  const gen = new DuplicateDashboardSuggestionGenerator();
  const panel = (expr: string) => [
    { id: 'p', title: '', description: '', queries: [{ refId: 'A', expr }], visualization: {} as any, row: 0, col: 0, width: 6, height: 4 },
  ];

  it('proposes one suggestion for a duplicate pair', async () => {
    const out = await gen.generate(
      ctx({
        dashboards: fakeDashboards([
          { id: 'b', title: 'B', panels: panel('rate(http_requests_total[5m])') },
          { id: 'a', title: 'A', panels: panel('rate(http_requests_total[5m])') },
          { id: 'c', title: 'C', panels: panel('other_metric') },
        ]),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.kind).toBe('duplicate_dashboard');
    expect(out[0]?.actionKind).toBe('merge_dashboards');
    const ids = (out[0]?.actionPayload as { dashboardIds: string[] }).dashboardIds;
    expect(ids).toEqual(['a', 'b']);
    // Deterministic dedup_key regardless of input order
    expect(out[0]?.dedupKey).toBe('duplicate_dashboard:a:b');
  });

  it('emits no suggestion when no duplicates exist', async () => {
    const out = await gen.generate(
      ctx({
        dashboards: fakeDashboards([
          { id: 'a', title: 'A', panels: panel('m1') },
          { id: 'b', title: 'B', panels: panel('m2') },
        ]),
      }),
    );
    expect(out).toHaveLength(0);
  });
});
