import { type AlertOperator } from '@agentic-obs/common';
import type { IAlertRuleRepository } from '@agentic-obs/data-layer';
import { PrometheusMetricsAdapter } from '@agentic-obs/adapters';
import { resolvePrometheusDatasource } from './dashboard-service.js';
import type { SetupConfigService } from './setup-config-service.js';
import {
  previewAlertCondition,
  type PreviewAlertResult,
} from './alert-evaluator-service.js';

export interface PreviewAlertRuleInput {
  query: string;
  operator: AlertOperator;
  threshold: number;
  lookbackHours?: number;
  /** Reserved — explicit datasource override; resolves to default Prom otherwise. */
  datasourceId?: string;
}

export class AlertRuleService {
  constructor(
    _store: IAlertRuleRepository,
    private readonly setupConfig: SetupConfigService,
  ) {}

  /**
   * Backtest an alert condition against the current metrics datasource over
   * `lookbackHours` (default 24). Resolves the default Prometheus datasource
   * for the org; returns a structured `missing_capability` payload when no
   * metrics datasource is configured. Never fabricates data.
   */
  async previewCondition(
    input: PreviewAlertRuleInput,
    orgId: string,
  ): Promise<PreviewAlertResult> {
    const datasources = await this.setupConfig.listDatasources({ orgId });
    const prom = resolvePrometheusDatasource(datasources);
    if (!prom) {
      return { kind: 'missing_capability', reason: 'no_metrics_datasource' };
    }
    const metrics = new PrometheusMetricsAdapter(prom.url, prom.headers);
    return previewAlertCondition(metrics, {
      query: input.query,
      operator: input.operator,
      threshold: input.threshold,
      lookbackHours: input.lookbackHours,
    });
  }
}
