import { describe, it, expect } from 'vitest';
import { suggestPivots } from './chart-pivots.js';
import type { ChartSummary } from './chart-summary.js';

const emptySummary = (kind: ChartSummary['kind']): ChartSummary => ({
  kind,
  oneLine: '',
  stats: {},
});

describe('suggestPivots', () => {
  it('latency p50 query → suggests p99', () => {
    const chips = suggestPivots({
      query: 'histogram_quantile(0.5, sum(rate(http_duration_bucket[5m])) by (le))',
      metricKind: 'latency',
      summary: emptySummary('latency'),
    });
    expect(chips[0]).toEqual({ label: 'Show p99', prompt: 'Show p99 instead' });
    expect(chips.some((c) => c.label === 'Show errors')).toBe(true);
    expect(chips.length).toBeLessThanOrEqual(3);
  });

  it('latency p99 query → suggests p50+p99 combo', () => {
    const chips = suggestPivots({
      query: 'histogram_quantile(0.99, sum(rate(http_duration_bucket[5m])) by (le))',
      metricKind: 'latency',
      summary: emptySummary('latency'),
    });
    expect(chips.find((c) => c.label === 'Show p50 + p99')).toBeTruthy();
  });

  it('counter rate query, no status grouping → suggests breakdown + errors + daily', () => {
    const chips = suggestPivots({
      query: 'sum(rate(http_requests_total[1m]))',
      metricKind: 'counter',
      summary: emptySummary('counter'),
    });
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Break down by status');
    expect(labels).toContain('Show errors');
    expect(labels).toContain('Daily total');
    expect(chips.length).toBe(3);
  });

  it('counter already-grouped by status → does not suggest status breakdown', () => {
    const chips = suggestPivots({
      query: 'sum by (status_code) (rate(http_requests_total[1m]))',
      metricKind: 'counter',
      summary: emptySummary('counter'),
    });
    expect(chips.find((c) => c.label === 'Break down by status')).toBeUndefined();
  });

  it('gauge not by instance → suggests top-5 + yesterday', () => {
    const chips = suggestPivots({
      query: 'node_memory_used_bytes',
      metricKind: 'gauge',
      summary: emptySummary('gauge'),
    });
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Top 5 by instance');
    expect(labels).toContain('Compare yesterday');
  });

  it('errors with path label → suggests group by endpoint + request rate', () => {
    const chips = suggestPivots({
      query: 'sum(rate(http_errors_total[1m])) by (path)',
      metricKind: 'errors',
      summary: emptySummary('errors'),
    });
    const labels = chips.map((c) => c.label);
    expect(labels).toContain('Show request rate');
    expect(labels).toContain('Group by endpoint');
    expect(labels).toContain('Show top error messages');
    expect(chips.length).toBe(3);
  });

  it('errors without path label → omits group-by-endpoint', () => {
    const chips = suggestPivots({
      query: 'sum(rate(http_5xx_total[1m]))',
      metricKind: 'errors',
      summary: emptySummary('errors'),
    });
    expect(chips.find((c) => c.label === 'Group by endpoint')).toBeUndefined();
    expect(chips.find((c) => c.label === 'Show request rate')).toBeTruthy();
  });

  it('never exceeds 3 chips', () => {
    const chips = suggestPivots({
      query: 'sum(rate(http_requests_total[1m]))',
      metricKind: 'counter',
      summary: emptySummary('counter'),
    });
    expect(chips.length).toBeLessThanOrEqual(3);
  });
});
