/**
 * Fire then heal — assert the rule transitions firing -> resolved (or
 * normal) once web-api comes back up.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiGet, apiDelete } from '../helpers/api-client.js';
import { createAlertRuleFixture, WEB_API_DOWN_QUERY } from '../helpers/alert-rule.js';
import { pollUntil } from '../helpers/wait.js';
import { scaleDeployment } from '../helpers/scale.js';

const NS = 'rounds-e2e';
const DEPLOY = 'web-api';

interface AlertRule { id: string; state: string }

describe('alerts/alert-resolves', () => {
  let ruleId: string | null = null;

  beforeAll(async () => {
    await scaleDeployment(NS, DEPLOY, 3);
  }, 180_000);

  afterAll(async () => {
    if (ruleId) {
      try { await apiDelete(`/api/alert-rules/${ruleId}`); } catch { /* noop */ }
    }
    try { await scaleDeployment(NS, DEPLOY, 3); } catch { /* noop */ }
  }, 180_000);

  it('rule transitions firing -> resolved when web-api is restored', async () => {
    const created = await createAlertRuleFixture({
      name: 'web-api-resolves',
      query: WEB_API_DOWN_QUERY,
      operator: '<',
      threshold: 1,
      forDurationSec: 30,
      severity: 'critical',
    });
    ruleId = created.id;

    await scaleDeployment(NS, DEPLOY, 0);
    await pollUntil(
      async () => {
        const r = await apiGet<AlertRule>(`/api/alert-rules/${ruleId}`);
        return r.state === 'firing' ? r : null;
      },
      { timeoutMs: 240_000, intervalMs: 3000, label: 'rule -> firing' },
    );

    await scaleDeployment(NS, DEPLOY, 3);
    const healed = await pollUntil<AlertRule>(
      async () => {
        const r = await apiGet<AlertRule>(`/api/alert-rules/${ruleId}`);
        return r.state === 'resolved' || r.state === 'normal' ? r : null;
      },
      { timeoutMs: 240_000, intervalMs: 3000, label: 'rule -> resolved' },
    );
    expect(['resolved', 'normal']).toContain(healed.state);
  }, 600_000);
});
