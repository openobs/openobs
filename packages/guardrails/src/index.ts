// @agentic-obs/guardrails - Safety guardrails

export interface GuardContext {
  tenantId: string;
  userId: string;
  environment: string;
  serviceId?: string;
}

export type GuardDecision = 'allow' | 'deny' | 'require_approval';

export interface GuardResult {
  decision: GuardDecision;
  reason?: string;
  riskLevel?: 'low' | 'medium' | 'high';
}

export interface Guard {
  name: string;
  check(input: unknown, context: GuardContext): Promise<GuardResult>;
}

export class GuardChain {
  private guards: Guard[] = [];

  add(guard: Guard): this {
    this.guards.push(guard);
    return this;
  }

  async check(input: unknown, context: GuardContext): Promise<GuardResult> {
    for (const guard of this.guards) {
      const result = await guard.check(input, context);
      if (result.decision !== 'allow') {
        return result;
      }
    }

    return { decision: 'allow' };
  }
}

export * from './cost-guard/index.js';
export * from './query-guard/index.js';
export * from './confidence-guard/index.js';
export { ActionGuard } from './action-guard/index.js';
export type { PolicyRule, ActionInput } from './action-guard/index.js';
export type { GuardDecision as ActionGuardDecision } from './action-guard/index.js';
export * from './credential/index.js';
