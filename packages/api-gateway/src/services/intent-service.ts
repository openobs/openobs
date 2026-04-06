import { createLogger, DEFAULT_LLM_MODEL, type AlertRule } from '@agentic-obs/common';

const log = createLogger('intent-service');
import { defaultAlertRuleStore } from '@agentic-obs/data-layer';
import { AlertRuleAgent } from '@agentic-obs/agent-core';
import { PrometheusMetricsAdapter } from '@agentic-obs/adapters';
import type { IGatewayDashboardStore } from '../repositories/types.js';
import { getSetupConfig } from '../routes/setup.js';
import { createLlmGateway } from '../routes/llm-factory.js';
import { resolvePrometheusDatasource } from './dashboard-service.js';

export type IntentType = 'alert' | 'dashboard' | 'investigate';

export interface IntentAlertResult {
  intent: 'alert';
  alertRuleId: string;
  summary: string;
  navigate: string;
}

export interface IntentDashboardResult {
  intent: 'dashboard';
  dashboardId: string;
  navigate: string;
}

export interface IntentInvestigateResult {
  intent: 'investigate';
  investigationId: string;
  navigate: string;
}

export type IntentResult = IntentAlertResult | IntentDashboardResult | IntentInvestigateResult;

export interface IntentProgress {
  type: 'thinking' | 'intent';
  data: unknown;
}

export class IntentService {
  constructor(private dashboardStore: IGatewayDashboardStore) {}

  /**
   * Classify the user's message into an intent using the LLM.
   * Returns one of: 'alert', 'dashboard', 'investigate'.
   */
  async classifyIntent(message: string): Promise<IntentType> {
    const config = getSetupConfig();
    if (!config.llm) {
      throw new Error('LLM not configured');
    }

    const gateway = createLlmGateway(config.llm);
    const model = config.llm.model || DEFAULT_LLM_MODEL;

    const classifyResp = await gateway.complete([
      {
        role: 'system',
        content:
          `You are an intent classifier for an observability platform. Classify the user's message into exactly one intent.\n\n`
          + `Return JSON: { "intent": "<intent>" }\n\n`
          + `Possible intents:\n`
          + `- "alert": The user wants to set up an alert, be notified, or monitor a condition with a threshold.\n`
          + `- "dashboard": The user wants to create or view a monitoring dashboard to visualize metrics.\n`
          + `- "investigate": The user is asking about a problem, wants to diagnose an issue, or is troubleshooting.\n\n`
          + `Classify based on the user's actual goal, not surface-level keywords.`,
      },
      { role: 'user', content: message },
    ], {
      model,
      maxTokens: 64,
      temperature: 0,
      responseFormat: 'json',
    });

    const cleaned = classifyResp.content.replace(/```json\n?/g, '').replace(/```/g, '').trim();
    try {
      const parsed = JSON.parse(cleaned) as { intent?: string };
      return (parsed.intent as IntentType) ?? 'dashboard';
    } catch {
      return 'dashboard';
    }
  }

  /**
   * Execute an alert intent: generate an alert rule from the message via LLM.
   */
  async executeAlertIntent(message: string): Promise<IntentAlertResult> {
    const config = getSetupConfig();
    if (!config.llm) {
      throw new Error('LLM not configured');
    }

    const gateway = createLlmGateway(config.llm);
    const model = config.llm.model || DEFAULT_LLM_MODEL;

    const prom = resolvePrometheusDatasource(config.datasources);
    const metrics = prom ? new PrometheusMetricsAdapter(prom.url, prom.headers) : undefined;

    const agent = new AlertRuleAgent({ gateway, model, metrics });
    const result = await agent.generate(message);
    const generated = result.rule;

    const rule = defaultAlertRuleStore.create({
      name: generated.name,
      description: generated.description,
      originalPrompt: message,
      condition: generated.condition,
      evaluationIntervalSec: generated.evaluationIntervalSec,
      severity: generated.severity,
      labels: generated.labels,
      createdBy: 'llm',
    } as any);

    return {
      intent: 'alert',
      alertRuleId: rule.id,
      summary: `Alert "${rule.name}" created: ${rule.condition.query} ${rule.condition.operator} ${rule.condition.threshold}`,
      navigate: '/alerts',
    };
  }

  /**
   * Execute a dashboard intent: create a dashboard workspace.
   */
  async executeDashboardIntent(message: string): Promise<IntentDashboardResult> {
    const dashboard = await this.dashboardStore.create({
      title: 'Untitled Dashboard',
      description: '',
      prompt: message,
      userId: 'anonymous',
      datasourceIds: [],
      useExistingMetrics: true,
    });

    return {
      intent: 'dashboard',
      dashboardId: dashboard.id,
      navigate: `/dashboards/${dashboard.id}`,
    };
  }

  /**
   * Execute an investigate intent: create a real Investigation.
   */
  async executeInvestigateIntent(message: string): Promise<IntentInvestigateResult> {
    const { defaultInvestigationStore, feedStore } = await import('@agentic-obs/data-layer');
    const { LiveOrchestratorRunner } = await import('../routes/investigation/live-orchestrator-runner.js');

    const investigation = await defaultInvestigationStore.create({
      question: message,
      sessionId: `ses_${Date.now()}`,
      userId: 'anonymous',
    });

    const orchestrator = new LiveOrchestratorRunner(defaultInvestigationStore, feedStore);
    orchestrator.run({
      investigationId: investigation.id,
      question: investigation.intent,
      sessionId: investigation.sessionId,
      userId: investigation.userId,
    });

    return {
      intent: 'investigate',
      investigationId: investigation.id,
      navigate: `/investigations/${investigation.id}`,
    };
  }

  /**
   * Full intent flow: classify then execute.
   * Calls onProgress for streaming updates.
   */
  async processMessage(
    message: string,
    onProgress: (event: IntentProgress) => void,
  ): Promise<IntentResult> {
    onProgress({ type: 'thinking', data: { content: 'Understanding your request...' } });

    const intent = await this.classifyIntent(message);
    log.info({ message: message.slice(0, 80), intent }, 'classified intent');
    onProgress({ type: 'intent', data: { intent } });

    if (intent === 'alert') {
      onProgress({ type: 'thinking', data: { content: 'Creating alert rule...' } });
      return this.executeAlertIntent(message);
    } else if (intent === 'investigate') {
      onProgress({ type: 'thinking', data: { content: 'Starting investigation...' } });
      return this.executeInvestigateIntent(message);
    } else {
      onProgress({ type: 'thinking', data: { content: 'Setting up dashboard workspace...' } });
      return this.executeDashboardIntent(message);
    }
  }
}
