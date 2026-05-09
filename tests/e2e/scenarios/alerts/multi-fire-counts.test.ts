/**
 * `fireCount` must increment on every fresh fire (fire / heal / fire).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiGet, apiDelete } from '../helpers/api-client.js';
import { createAlertRuleFixture, WEB_API_DOWN_QUERY } from '../helpers/alert-rule.js';
import { pollUntil } from '../helpers/wait.js';
import { scaleDeployment } from '../helpers/scale.js';

const NS = 'rounds-e2e';
const DEPLOY = 'web-api';

interface AlertRule { id: string; state: string; fireCount?: number }

async function waitState(id: string, target: string[]): Promise<AlertRule> {
  return pollUntil(
    async () => {
      const r = await apiGet<AlertRule>(`/api/alert-rules/${id}`);
      return target.includes(r.state) ? r : null;
    },
    { timeoutMs: 240_000, intervalMs: 3000, label: `rule -> ${target.join('|')}` },
  );
}

describe('alerts/multi-fire-counts', () => {
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

  it('fireCount increments on each fresh firing transition', async () => {
    const created = await createAlertRuleFixture({
      name: 'web-api-multi',
      query: WEB_API_DOWN_QUERY,
      operator: '<',
      threshold: 1,
      forDurationSec: 30,
      severity: 'critical',
    });
    ruleId = created.id;

    await scaleDeployment(NS, DEPLOY, 0);
    const first = await waitState(ruleId!, ['firing']);

    await scaleDeployment(NS, DEPLOY, 3);
    await waitState(ruleId!, ['resolved', 'normal']);

    await scaleDeployment(NS, DEPLOY, 0);
    const second = await waitState(ruleId!, ['firing']);

    expect(typeof first.fireCount).toBe('number');
    expect(typeof second.fireCount).toBe('number');
    expect(second.fireCount!).toBeGreaterThan(first.fireCount!);
  }, 600_000);
});
