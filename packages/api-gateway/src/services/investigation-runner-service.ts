import { randomUUID } from 'node:crypto';

import { createLogger } from '@agentic-obs/common';
import type { Evidence, Hypothesis } from '@agentic-obs/common';

const log = createLogger('investigation-runner');
import type { ExplanationResult } from '@agentic-obs/agent-core';
import {
  DashboardInvestigationAgent as InvestigationAgent,
  type DashboardInvestigationDeps as InvestigationDeps,
  type DashboardInvestigationOutput as InvestigationOutput,
} from '@agentic-obs/agent-core';
import { PrometheusMetricsAdapter } from '@agentic-obs/adapters';
import { defaultInvestigationReportStore } from '@agentic-obs/data-layer';

import { getSetupConfig } from '../routes/setup.js';
import { createLlmGateway } from '../routes/llm-factory.js';
import type { IGatewayInvestigationStore, IGatewayFeedStore } from '../repositories/types.js';
import type { OrchestratorRunner, OrchestratorRunInput } from '../routes/investigation/orchestrator-runner.js';

export class LiveOrchestratorRunner implements OrchestratorRunner {
  constructor(
    private readonly store: IGatewayInvestigationStore,
    private readonly feed: IGatewayFeedStore,
  ) {}

  run(input: OrchestratorRunInput): void {
    void this.execute(input);
  }

  private async execute(input: OrchestratorRunInput): Promise<void> {
    const { investigationId, question } = input;

    try {
      const config = getSetupConfig();
      if (!config.llm) {
        throw new Error('LLM not configured - please complete the Setup Wizard first.');
      }

      const gateway = createLlmGateway(config.llm);
      const model = config.llm.model;
      const promDatasources = config.datasources.filter(
        (d) => d.type === 'prometheus' || d.type === 'victoria-metrics',
      );

      if (promDatasources.length === 0) {
        throw new Error('No Prometheus or Victoria Metrics datasource configured.');
      }

      // Update status to planning
      await this.store.updateStatus(investigationId, 'planning');

      // Create the InvestigationAgent with proper dependencies
      const metricsAdapter = new PrometheusMetricsAdapter(promDatasources[0]!.url);
      const deps: InvestigationDeps = {
        gateway,
        model,
        metrics: metricsAdapter,
        // SSE events are not sent to a browser here — this is async background work.
        // We log them and update the investigation store instead.
        sendEvent: (event) => {
          log.debug({ investigationId, event: event.type }, 'investigation event');
          // Map SSE events to investigation status updates
          if (event.type === 'tool_call' && event.tool === 'investigate_plan') {
            void this.store.updateStatus(investigationId, 'planning');
          } else if (event.type === 'tool_call' && event.tool === 'investigate_query') {
            void this.store.updateStatus(investigationId, 'investigating');
          } else if (event.type === 'tool_call' && event.tool === 'investigate_analyze') {
            void this.store.updateStatus(investigationId, 'explaining');
          }
        },
      };

      const agent = new InvestigationAgent(deps);

      // Run the full investigation pipeline (plan → query → analyze → report)
      const result: InvestigationOutput = await agent.investigate({
        goal: question,
        existingPanels: [],
        gridNextRow: 0,
      });

      // Extract evidence and hypotheses from the report for the investigation store
      const evidence = this.extractEvidence(result, investigationId);
      const hypotheses = this.extractHypotheses(result, investigationId, evidence);
      const conclusion: ExplanationResult = {
        summary: result.summary,
        rootCause: null,
        confidence: 0.7,
        recommendedActions: [],
      };

      // Update the investigation with results
      await this.store.updatePlan(investigationId, {
        entity: '',
        objective: question,
        steps: [
          { id: 'plan', type: 'plan', description: 'Plan investigation queries', status: 'completed' },
          { id: 'query', type: 'query', description: 'Execute Prometheus queries', status: 'completed' },
          { id: 'analyze', type: 'analyze', description: 'Analyze evidence and generate report', status: 'completed' },
        ],
        stopConditions: [],
      });

      await this.store.updateResult(investigationId, {
        hypotheses,
        evidence,
        conclusion,
      });

      // Save the LLM-generated narrative report
      defaultInvestigationReportStore.save({
        id: randomUUID(),
        dashboardId: investigationId,
        goal: question,
        summary: result.report.summary,
        sections: result.report.sections,
        createdAt: new Date().toISOString(),
      });

      await this.store.updateStatus(investigationId, 'completed');
      await this.feed.add(
        'investigation_complete',
        question.length > 50 ? `${question.slice(0, 57)}...` : question,
        result.summary,
        0.7 >= 0.7 ? 'medium' : 'low',
        investigationId,
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      log.error({ investigationId, error: errorMsg }, 'investigation failed');

      const conclusion: ExplanationResult = {
        summary: `Investigation failed: ${errorMsg}`,
        rootCause: null,
        confidence: 0,
        recommendedActions: ['Check LLM configuration in Settings', 'Verify datasource connectivity'],
      };

      try {
        await this.store.updateResult(investigationId, { hypotheses: [], evidence: [], conclusion });
      } catch { /* ignore store errors during failure handling */ }

      await this.store.updateStatus(investigationId, 'failed');
    }
  }

  /**
   * Extract evidence from the investigation report panels.
   */
  private extractEvidence(result: InvestigationOutput, investigationId: string): Evidence[] {
    const evidence: Evidence[] = [];
    for (const section of result.report.sections) {
      if (section.type === 'evidence' && section.panel) {
        const query = section.panel.queries?.[0]?.expr ?? section.panel.query ?? '';
        evidence.push({
          id: randomUUID(),
          hypothesisId: '',
          type: 'metric',
          query,
          queryLanguage: 'promql',
          result: { query, series: [], totalSeries: 0 },
          summary: section.content ?? section.panel.title,
          timestamp: new Date().toISOString(),
          reproducible: true,
        });
      }
    }
    return evidence;
  }

  /**
   * Extract hypotheses from the report summary.
   */
  private extractHypotheses(result: InvestigationOutput, investigationId: string, evidence: Evidence[]): Hypothesis[] {
    return [{
      id: randomUUID(),
      investigationId,
      description: result.summary,
      confidence: 0.7,
      confidenceBasis: `Based on ${evidence.length} evidence items`,
      status: 'supported' as const,
      evidenceIds: evidence.map((e) => e.id),
      counterEvidenceIds: [],
    }];
  }
}
