import { describe, expect, it, vi } from 'vitest';
import type { Investigation } from '@agentic-obs/common';
import type { IGatewayFeedStore, IGatewayInvestigationStore } from '@agentic-obs/data-layer';
import { computeQualityMetrics } from './meta.js';

function investigation(id: string, workspaceId: string): Investigation {
  return {
    id,
    sessionId: `session_${id}`,
    userId: 'user_1',
    intent: 'investigate',
    structuredIntent: {
      taskType: 'general_query',
      entity: 'service',
      timeRange: { start: '2026-04-30T00:00:00.000Z', end: '2026-04-30T00:01:00.000Z' },
      goal: 'investigate',
    },
    plan: {
      entity: 'service',
      objective: 'investigate',
      steps: [
        { id: 'step_1', type: 'query', description: 'query', status: 'completed', cost: { tokens: 10, queries: 2, latencyMs: 100 } },
      ],
      stopConditions: [],
    },
    status: 'completed',
    hypotheses: [{
      id: 'h1',
      investigationId: id,
      description: 'hypothesis',
      confidence: 0.5,
      confidenceBasis: 'test',
      evidenceIds: ['e1'],
      counterEvidenceIds: [],
      status: 'supported',
    }],
    actions: [],
    evidence: [{
      id: 'e1',
      hypothesisId: 'h1',
      type: 'metric',
      query: 'up',
      queryLanguage: 'promql',
      result: {},
      summary: 'evidence',
      timestamp: '2026-04-30T00:00:30.000Z',
      reproducible: true,
    }],
    symptoms: [],
    workspaceId,
    createdAt: '2026-04-30T00:00:00.000Z',
    updatedAt: '2026-04-30T00:01:00.000Z',
  };
}

function feedStats() {
  return {
    total: 1,
    withFeedback: 1,
    feedbackRate: 1,
    byVerdict: {
      useful: 1,
      not_useful: 0,
      root_cause_correct: 0,
      root_cause_wrong: 0,
      partially_correct: 0,
    },
    hypothesisVerdicts: { correct: 0, wrong: 0 },
    actionVerdicts: { helpful: 0, notHelpful: 0 },
    followedUpCount: 1,
    proactiveHitRate: 1,
  };
}

describe('computeQualityMetrics', () => {
  it('aggregates only the requested org and requests tenant-scoped feed stats', async () => {
    const investigationStore = {
      findAll: vi.fn(async () => [
        investigation('inv_a', 'org_a'),
        investigation('inv_b', 'org_b'),
      ]),
    } as Partial<IGatewayInvestigationStore> as IGatewayInvestigationStore;
    const feedStore = {
      getStats: vi.fn(async () => feedStats()),
    } as Partial<IGatewayFeedStore> as IGatewayFeedStore;

    const metrics = await computeQualityMetrics(investigationStore, feedStore, 'org_a');

    expect(metrics.totalInvestigations).toBe(1);
    expect(metrics.avgTokensPerInvestigation).toBe(10);
    expect(metrics.avgQueriesPerInvestigation).toBe(2);
    expect(metrics.dailyTrend).toEqual([
      { date: '2026-04-30', investigations: 1, avgDurationMs: 60_000 },
    ]);
    expect(feedStore.getStats).toHaveBeenCalledWith({ tenantId: 'org_a' });
  });
});
