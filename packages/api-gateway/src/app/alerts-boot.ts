/**
 * Boot wiring for the alert evaluator.
 *
 * Phase 0.5 of `docs/design/auto-remediation.md` boot path. Stands up
 * the periodic AlertEvaluatorService against the configured default
 * Prometheus-compatible datasource, behind a feature flag.
 *
 *   ALERT_EVALUATOR_ENABLED   default 'true'
 *
 * v1 single-process: no leader lock, no cross-replica HA. The evaluator
 * is fine to run in one api-gateway instance until horizontal-scale
 * lands (tracked as a follow-up in the design doc).
 *
 * Wiring the AutoInvestigationDispatcher to this evaluator is a
 * separate follow-up — that needs an orchestrator factory extracted
 * from chat-service.
 */

import { createLogger } from '@agentic-obs/common/logging';
import { PrometheusMetricsAdapter } from '@agentic-obs/adapters';
import {
  AlertEvaluatorService,
  type MetricQueryFn,
} from '../services/alert-evaluator-service.js';
import {
  resolvePrometheusDatasource,
  type PrometheusDatasource,
} from '../services/dashboard-service.js';
import type { SetupConfigService } from '../services/setup-config-service.js';
import type { IAlertRuleRepository } from '@agentic-obs/data-layer';

const log = createLogger('alerts-boot');

function envFlag(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * Build a `MetricQueryFn` that resolves a rule's PromQL against the
 * configured default Prometheus-compatible datasource and returns the
 * latest scalar value.
 *
 * `null` return = "no sample". The evaluator treats null as "leave
 * state alone", which matches alertmanager semantics: stale =
 * inconclusive.
 *
 * Datasource resolution is **per-call** so an operator can swap
 * datasources at runtime without restarting the api-gateway. The
 * downside is a small overhead per tick; the upside is consistency
 * with the rest of the system (which does the same).
 *
 * Multi-series queries are folded to the first sample. Production
 * alert rules are expected to aggregate to a scalar (e.g. `sum(...) by ()`).
 */
export function buildMetricQueryFn(setupConfig: SetupConfigService): MetricQueryFn {
  return async (rule) => {
    const datasources = await setupConfig.listDatasources();
    const prom: PrometheusDatasource | undefined = resolvePrometheusDatasource(datasources);
    if (!prom) {
      log.debug({ ruleId: rule.id }, 'no Prometheus datasource configured; skipping evaluation');
      return null;
    }
    const adapter = new PrometheusMetricsAdapter(prom.url, prom.headers);
    try {
      const samples = await adapter.instantQuery(rule.condition.query);
      const first = samples[0];
      if (!first) return null;
      const v = Number(first.value);
      return Number.isFinite(v) ? v : null;
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), ruleId: rule.id },
        'metric query failed; treating as no-sample',
      );
      return null;
    }
  };
}

export interface MountAlertsDeps {
  rules: IAlertRuleRepository;
  setupConfig: SetupConfigService;
}

/**
 * Start the evaluator (if enabled). Returns a `{ evaluator, stop }`
 * handle so a graceful-shutdown caller can clean up timers, AND so the
 * follow-up that wires AutoInvestigationDispatcher can subscribe to
 * the evaluator's `alert.fired` events without re-instantiating it.
 */
export async function startAlerts(deps: MountAlertsDeps): Promise<{
  evaluator: AlertEvaluatorService | null;
  stop: () => void;
}> {
  if (!envFlag('ALERT_EVALUATOR_ENABLED', true)) {
    log.info('alert evaluator disabled by ALERT_EVALUATOR_ENABLED=false');
    return { evaluator: null, stop: () => undefined };
  }

  const evaluator = new AlertEvaluatorService({
    rules: deps.rules,
    query: buildMetricQueryFn(deps.setupConfig),
  });
  await evaluator.start();
  log.info('alert evaluator started');

  return {
    evaluator,
    stop: () => evaluator.stop(),
  };
}
