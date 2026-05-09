import { apiPost } from './api-client.js';

export interface AlertRule {
  id: string;
  name: string;
  state: 'normal' | 'pending' | 'firing' | 'resolved' | 'disabled';
  investigationId?: string;
}

export interface CreateAlertRuleFixtureInput {
  name: string;
  query: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  forDurationSec: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description?: string;
}

export function createAlertRuleFixture(input: CreateAlertRuleFixtureInput): Promise<AlertRule> {
  return apiPost<AlertRule>('/api/alert-rules', {
    name: input.name,
    description: input.description ?? input.name,
    originalPrompt: input.description ?? input.name,
    condition: {
      query: input.query,
      operator: input.operator,
      threshold: input.threshold,
      forDurationSec: input.forDurationSec,
    },
    evaluationIntervalSec: 10,
    severity: input.severity,
    labels: { source: 'e2e' },
  });
}

export const WEB_API_DOWN_QUERY = '(sum(rate(http_requests_total{app="web-api"}[1m])) or vector(0))';
