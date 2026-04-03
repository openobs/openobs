// ExecutionAgent - LLM-classified recommended action generator (with rule-based fallback)
import type { Evidence } from '@agentic-obs/common';
import type { LLMGateway } from '@agentic-obs/llm-gateway';
import { DEFAULT_RULES, criticalNotifyRule, classifyAndRecommendActions } from './rules.js';
import type { ActionRule, ExecutionInput, ExecutionOutput } from './types.js';

export class ExecutionAgent {
  readonly name = 'execution';
  private readonly rules: ActionRule[];
  private readonly maxActions: number;
  private readonly gateway?: LLMGateway;
  private readonly model: string;

  constructor(options: {
    rules?: ActionRule[];
    maxActions?: number;
    gateway?: LLMGateway;
    model?: string;
  } = {}) {
    this.rules = options.rules ?? DEFAULT_RULES;
    this.maxActions = options.maxActions ?? 5;
    this.gateway = options.gateway;
    this.model = options.model ?? 'claude-sonnet-4-6';
  }

  async propose(input: ExecutionInput): Promise<ExecutionOutput> {
    const { conclusion, context } = input;

    // ---- Primary path: LLM-based classification ----
    if (this.gateway) {
      const hypotheses = conclusion.hypotheses
        .filter((h) => h.hypothesis.status !== 'refuted')
        .map((ranked) => ({
          hypothesis: ranked.hypothesis,
          evidence: [] as Evidence[],
        }));

      let actions = await classifyAndRecommendActions(
        hypotheses,
        context.entity,
        this.gateway,
        this.model,
      );

      // Enforce max actions
      actions = actions.slice(0, this.maxActions);

      // Add critical notify if needed and not already present
      const seenTypes = new Set(actions.map((a) => a.type));
      if (conclusion.impact.severity === 'critical' && !seenTypes.has('notify')) {
        const notifyHypothesis = conclusion.hypotheses[0]?.hypothesis;
        if (notifyHypothesis) {
          const notify = criticalNotifyRule.buildAction(notifyHypothesis, [], context.entity);
          actions.push(notify);
        }
      }

      // Append any conclusion-recommended actions not already covered
      for (const rec of conclusion.recommendedActions) {
        if (actions.length >= this.maxActions) break;
        if (seenTypes.has(rec.action.type)) continue;
        seenTypes.add(rec.action.type);
        actions.push({ ...rec.action, status: 'proposed' as const });
      }

      const summary = this.buildSummary(actions, context.entity);
      return { actions, summary };
    }

    // ---- Fallback path: legacy rule-based matching ----
    return this.proposeLegacy(input);
  }

  private async proposeLegacy(input: ExecutionInput): Promise<ExecutionOutput> {
    const actions = [];
    const seenTypes = new Set<string>();
    const { conclusion, context } = input;

    for (const ranked of conclusion.hypotheses) {
      if (actions.length >= this.maxActions) break;
      const { hypothesis } = ranked;
      if (hypothesis.status === 'refuted') continue;
      const evidence: Evidence[] = [];
      for (const rule of this.rules) {
        if (actions.length >= this.maxActions) break;
        if (!rule.matches(hypothesis, evidence)) continue;
        const action = rule.buildAction(hypothesis, evidence, context.entity);
        if (seenTypes.has(action.type)) continue;
        seenTypes.add(action.type);
        actions.push(action);
      }
    }

    if (conclusion.impact.severity === 'critical' && !seenTypes.has('notify')) {
      const notifyHypothesis = conclusion.hypotheses[0]?.hypothesis;
      if (notifyHypothesis) {
        const notify = criticalNotifyRule.buildAction(notifyHypothesis, [], context.entity);
        actions.push(notify);
      }
    }

    for (const rec of conclusion.recommendedActions) {
      if (actions.length >= this.maxActions) break;
      if (seenTypes.has(rec.action.type)) continue;
      seenTypes.add(rec.action.type);
      actions.push({ ...rec.action, status: 'proposed' as const });
    }

    const summary = this.buildSummary(actions, context.entity);
    return { actions, summary };
  }

  private buildSummary(actions: { type: string; policyTag?: string }[], entity: string): string {
    if (actions.length === 0) {
      return `No actionable recommendations generated for ${entity}.`;
    }
    const descriptions = actions.map((a) => `${a.type} (${a.policyTag})`).join(', ');
    return `Generated ${actions.length} recommended action(s) for ${entity}: ${descriptions}. All actions require operator review - none will auto-execute.`;
  }
}
