import type { Sender, AlertFiredEventPayload, SenderResult } from './types.js';

const DEFAULT_EVENTS_API_URL = 'https://events.pagerduty.com/v2/enqueue';

type PagerDutySeverity = 'critical' | 'error' | 'warning' | 'info';

function routingKey(settings: Record<string, string> | undefined): string {
  return settings?.['integrationKey'] ?? settings?.['routingKey'] ?? '';
}

function mapSeverity(severity: AlertFiredEventPayload['severity']): PagerDutySeverity {
  switch (severity) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'error';
    case 'medium':
      return 'warning';
    case 'low':
      return 'info';
    default:
      return 'error';
  }
}

function buildPagerDutyEvent(payload: AlertFiredEventPayload, key: string): unknown {
  return {
    routing_key: key,
    event_action: 'trigger',
    dedup_key: payload.fingerprint,
    payload: {
      summary: `[${payload.severity.toUpperCase()}] ${payload.ruleName}`,
      source: payload.labels['service'] ?? payload.labels['namespace'] ?? 'rounds',
      severity: mapSeverity(payload.severity),
      custom_details: {
        ruleId: payload.ruleId,
        orgId: payload.orgId,
        value: payload.value,
        threshold: payload.threshold,
        operator: payload.operator,
        labels: payload.labels,
        firedAt: payload.firedAt,
      },
    },
  };
}

export const pagerDutySender: Sender = async (integration, payload): Promise<SenderResult> => {
  const key = routingKey(integration.settings);
  if (!key) {
    return { ok: false, message: 'No PagerDuty integration key configured' };
  }

  try {
    const resp = await fetch(DEFAULT_EVENTS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildPagerDutyEvent(payload, key)),
      signal: AbortSignal.timeout(10_000),
    });
    return {
      ok: resp.ok,
      message: resp.ok ? 'Notification sent successfully' : `HTTP ${resp.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
};
