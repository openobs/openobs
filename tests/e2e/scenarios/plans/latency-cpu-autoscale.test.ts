/**
 * Scenario — latency-symptom alert resolves via CPU-driven autoscale.
 *
 * The full SRE storyline this test exercises:
 *   1. Latency p99 climbs because web-api is pinned to one replica and
 *      load-200 is fanned out wide enough to saturate its 200m CPU
 *      limit. Container CPU throttling pushes scheduling delay into
 *      the request path; p99 of even trivial Go handlers crosses ~50ms.
 *   2. Alert fires on p99 latency (NOT on CPU directly). The agent has
 *      to investigate to derive the cause — that's the whole point of
 *      this scenario vs. CPU-direct alerts.
 *   3. Investigation correlates the latency rise with CPU saturation
 *      (process_cpu_seconds_total approaching the limit).
 *   4. Investigation files a remediation plan with a `kubectl scale
 *      deploy/web-api -n openobs-e2e --replicas=N` step (N > 1).
 *   5. Test approves the plan. Executor runs the scale.
 *   6. Per-pod CPU pressure drops, p99 latency falls, alert resolves.
 *
 * Caveat on threshold tuning:
 * `quay.io/brancz/prometheus-example-app` exposes
 * `http_request_duration_seconds_bucket{path="/"}` via promauto, but the
 * handler does no real work — so even under CPU saturation the absolute
 * latency stays in the tens-of-ms range, not seconds. The 50ms
 * threshold is calibrated for "kernel scheduling delay under CPU
 * throttling" and is NOT representative of a real user-facing latency
 * SLO. A truly representative test needs a CPU-bound workload (~30
 * LOC custom image); this scenario uses what the existing fixtures
 * already provide so it can ship without new images.
 *
 * Caveat on the LLM-driven assertion:
 * CPU-saturation has multiple plausible remediations (scale up, raise
 * CPU limit, optimize the handler). We assert the agent picks "scale
 * up" because (a) it's the only one expressible as a single kubectl
 * step against an attached connector, (b) the worked example in
 * orchestrator-prompt.ts uses scale-up for the latency-hotspot case,
 * and (c) raising a limit is a Deployment patch — possible but a less
 * natural first response. If the agent picks limit-patch instead the
 * assertion needs to widen.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiPost, apiGet, apiDelete } from '../helpers/api-client.js';
import { createAlertRuleFixture } from '../helpers/alert-rule.js';
import { pollUntil } from '../helpers/wait.js';
import { scaleDeployment } from '../helpers/scale.js';

const NS = 'openobs-e2e';
const TARGET = 'web-api';
const LOAD = 'load-200';
const BASELINE_LOAD_REPLICAS = 1;
const SATURATING_LOAD_REPLICAS = 30;

interface AlertRule {
  id: string;
  state: 'normal' | 'pending' | 'firing' | 'resolved' | 'disabled';
  investigationId?: string;
}
interface PlanStep {
  ordinal: number;
  status: string;
  commandText: string;
  paramsJson?: { argv?: string[]; connectorId?: string };
}
interface Plan {
  id: string;
  status: string;
  investigationId: string;
  steps: PlanStep[];
}

describe.skipIf(!process.env['OPENOBS_TEST_LLM_API_KEY'])('latency-cpu-autoscale', () => {
  let ruleId: string | null = null;

  beforeAll(async () => {
    // Concentrate load on one pod so per-process CPU saturates and per-pod
    // latency rises. Three replicas would average the load away.
    await scaleDeployment(NS, TARGET, 1);
    await scaleDeployment(NS, LOAD, BASELINE_LOAD_REPLICAS);
  }, 180_000);

  afterAll(async () => {
    if (ruleId) {
      try { await apiDelete(`/api/alert-rules/${ruleId}`); } catch { /* noop */ }
    }
    // Best-effort restore. Either step failing must not mask test failure.
    try { await scaleDeployment(NS, LOAD, BASELINE_LOAD_REPLICAS); } catch { /* noop */ }
    try { await scaleDeployment(NS, TARGET, 3); } catch { /* noop */ }
  }, 180_000);

  it('latency alert → investigation → plan scales web-api → alert resolves', async () => {
    // Pin the PromQL explicitly. p99 over a 1-minute window > 50ms sustained for 30s.
    // Idle baseline is sub-millisecond; the 50ms threshold has ~50× margin
    // above noise but is reachable under sustained CPU throttling.
    const created = await createAlertRuleFixture({
      name: 'web-api-latency-high',
      query: 'histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{app="web-api"}[1m])))',
      operator: '>',
      threshold: 0.05,
      forDurationSec: 30,
      severity: 'high',
    });
    expect(created.id).toBeTruthy();
    ruleId = created.id;

    // Drive saturation: ~30 curl pods × ~5 RPS each = ~150 RPS hammering
    // the single web-api pod. Go runtime + http handler get throttled at
    // the 200m container limit; per-request scheduling delay crosses 50ms.
    await scaleDeployment(NS, LOAD, SATURATING_LOAD_REPLICAS);

    // Fire budget: ~5s scrape + 30s `for` + load ramp-up jitter = 60-150s.
    // Generous 240s buffer for resource-tight CI nodes.
    const fired = await pollUntil<AlertRule>(
      async () => {
        const rule = await apiGet<AlertRule>(`/api/alert-rules/${ruleId}`);
        return rule.state === 'firing' ? rule : null;
      },
      { timeoutMs: 240_000, intervalMs: 3000, label: 'latency rule -> firing' },
    );
    expect(fired.state).toBe('firing');

    // Dispatcher links investigationId on the firing transition.
    const linked = await pollUntil<AlertRule>(
      async () => {
        const rule = await apiGet<AlertRule>(`/api/alert-rules/${ruleId}`);
        return rule.investigationId ? rule : null;
      },
      { timeoutMs: 60_000, intervalMs: 2000, label: 'rule.investigationId set' },
    );
    const investigationId = linked.investigationId!;

    // The agent's investigation must (a) correlate latency with CPU and
    // (b) emit a remediation plan. Latency-symptom investigations tend to
    // run more queries than the no-data case, so use a longer budget.
    const plans = await pollUntil<Plan[]>(
      async () => {
        const list = await apiGet<Plan[]>(
          `/api/plans?status=pending_approval&investigationId=${encodeURIComponent(investigationId)}`,
        );
        return Array.isArray(list) && list.length > 0 ? list : null;
      },
      { timeoutMs: 240_000, intervalMs: 3000, label: 'remediation plan in pending_approval' },
    );
    const plan = plans[0]!;

    // The plan must scale web-api up. Lenient match: any step whose argv
    // contains both `scale`, `deploy/web-api`, and `--replicas=` with N>1.
    // We don't pin N — the agent could reasonably pick 2, 3, or 4.
    const scaleStep = plan.steps.find((s) => {
      const argv = s.paramsJson?.argv ?? [];
      const hasScale = argv.includes('scale');
      const hasTarget = argv.some((a) => a.includes(`deploy/${TARGET}`) || a === TARGET);
      const replicasArg = argv.find((a) => a.startsWith('--replicas='));
      const replicas = replicasArg ? Number.parseInt(replicasArg.split('=')[1] ?? '0', 10) : 0;
      return hasScale && hasTarget && replicas > 1;
    });
    expect(
      scaleStep,
      `plan ${plan.id} should contain a scale step with replicas>1; got steps: ${
        plan.steps.map((s) => s.commandText).join(' | ')
      }`,
    ).toBeTruthy();

    // Approve. Executor runs synchronously up to completion or next pause.
    await apiPost(`/api/plans/${plan.id}/approve`, { autoEdit: false });

    const finalPlan = await pollUntil<Plan>(
      async () => {
        const p = await apiGet<Plan>(`/api/plans/${plan.id}`);
        return p.status === 'completed' ? p : null;
      },
      { timeoutMs: 90_000, intervalMs: 2000, label: `plan ${plan.id} -> completed` },
    );
    expect(finalPlan.status).toBe('completed');
    for (const s of finalPlan.steps) {
      expect(s.status, `step ${s.ordinal} status`).toBe('done');
    }

    // Plan executed = web-api scaled up = per-pod CPU pressure drops =
    // latency falls back below threshold = alert resolves.
    await pollUntil<AlertRule>(
      async () => {
        const rule = await apiGet<AlertRule>(`/api/alert-rules/${ruleId}`);
        return rule.state === 'normal' || rule.state === 'resolved' ? rule : null;
      },
      { timeoutMs: 180_000, intervalMs: 3000, label: 'rule resolves after autoscale' },
    );
  }, 720_000);
});
