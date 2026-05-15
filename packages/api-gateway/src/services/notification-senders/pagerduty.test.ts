import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ContactPointIntegration } from '@agentic-obs/common';
import { pagerDutySender } from './pagerduty.js';
import { senderFor } from './index.js';
import type { AlertFiredEventPayload } from './types.js';

const integration: ContactPointIntegration = {
  id: 'pd-1',
  type: 'pagerduty',
  name: 'PagerDuty',
  settings: { integrationKey: 'pd-routing-key' },
};

const payload: AlertFiredEventPayload = {
  ruleId: 'r1',
  ruleName: 'high-error-rate',
  orgId: 'org_main',
  severity: 'high',
  value: 0.42,
  threshold: 0.05,
  operator: '>',
  labels: { team: 'web', service: 'api-gateway', env: 'prod' },
  firedAt: '2026-05-03T00:00:00Z',
  fingerprint: 'fp-1',
};

describe('pagerDutySender', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is registered in senderFor()', () => {
    expect(senderFor('pagerduty')).toBe(pagerDutySender);
  });

  it('POSTs an Events API v2 trigger event', async () => {
    const result = await pagerDutySender(integration, payload);
    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0]!;
    expect(String(calledUrl)).toBe('https://events.pagerduty.com/v2/enqueue');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.routing_key).toBe('pd-routing-key');
    expect(body.event_action).toBe('trigger');
    expect(body.dedup_key).toBe('fp-1');
    expect(body.payload.summary).toContain('high-error-rate');
    expect(body.payload.source).toBe('api-gateway');
    expect(body.payload.severity).toBe('error');
    expect(body.payload.custom_details.labels.team).toBe('web');
  });

  it('returns ok:false when the response is non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    const result = await pagerDutySender(integration, payload);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('400');
  });

  it('returns ok:false when no integration key is configured', async () => {
    const result = await pagerDutySender({ ...integration, settings: {} }, payload);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/integration key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
