import type { AlertRuleProvider } from '@agentic-obs/common';
import type { AlertRule, AlertRuleState } from '@agentic-obs/common';
import type { AlertRuleStore } from './alert-rule-store.js';

/**
 * Bridges AlertRuleStore to the AlertRuleProvider interface expected by the evaluator.
 */
export class AlertRuleStoreProvider implements AlertRuleProvider {
  constructor(private readonly store: AlertRuleStore) {}

  getActiveRules(): AlertRule[] {
    return this.store.findAll().list.filter((r) => r.state !== 'disabled');
  }

  transition(id: string, newState: AlertRuleState, value?: number): AlertRule | undefined {
    return this.store.transition(id, newState, value);
  }

  markEvaluated(id: string): void {
    this.store.update(id, { lastEvaluatedAt: new Date().toISOString() });
  }
}
