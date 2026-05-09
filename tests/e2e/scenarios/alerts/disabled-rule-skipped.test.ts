/**
 * Disabling a rule must keep the evaluator from advancing its state,
 * even after we breach the rule's condition. We use the `/disable`
 * endpoint and assert state stays `disabled` across multiple eval cycles.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiPost, apiGet, apiDelete } from '../helpers/api-client.js';
import { createAlertRuleFixture, WEB_API_DOWN_QUERY } from '../helpers/alert-rule.js';
import { scaleDeployment } from '../helpers/scale.js';

const NS = 'rounds-e2e';
const DEPLOY = 'web-api';

interface AlertRule { id: string; state: string }

describe('alerts/disabled-rule-skipped', () => {
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

  it('disabled rule stays disabled when its condition breaches', async () => {
    const created = await createAlertRuleFixture({
      name: 'web-api-disabled',
      query: WEB_API_DOWN_QUERY,
      operator: '<',
      threshold: 1,
      forDurationSec: 10,
      severity: 'critical',
    });
    ruleId = created.id;
    const disabled = await apiPost<AlertRule>(`/api/alert-rules/${ruleId}/disable`, {});
    expect(disabled.state).toBe('disabled');

    await scaleDeployment(NS, DEPLOY, 0);

    // Sample state across at least 3 evaluator ticks (~90s with default interval).
    const samples: string[] = [];
    const sampleCount = 3;
    for (let i = 0; i < sampleCount; i += 1) {
      await new Promise((r) => setTimeout(r, 30_000));
      const r = await apiGet<AlertRule>(`/api/alert-rules/${ruleId}`);
      samples.push(r.state);
    }
    expect(samples.every((s) => s === 'disabled'), `samples=${samples.join(',')}`).toBe(true);
  }, 180_000);
});
