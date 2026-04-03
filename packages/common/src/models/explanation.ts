// Explanation types - shared between agent-core and data-layer

export interface ExplanationResult {
  summary: string;
  rootCause: string | null;
  confidence: number;
  recommendedActions: string[];
}
