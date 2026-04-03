// Post-Mortem Report types - shared between agent-core and data-layer

export interface PostMortemTimelineEntry {
  timestamp: string;
  description: string;
}

export interface PostMortemReport {
  id: string;
  incidentId: string;
  summary: string;
  impact: string;
  timeline: PostMortemTimelineEntry[];
  rootCause: string;
  actionsTaken: string[];
  lessonsLearned: string[];
  actionItems: string[];
  generatedAt: string;
  generatedBy: 'llm';
}

export interface PostMortemIncidentInput {
  id: string;
  title: string;
  severity: string;
  status: string;
  services: string[];
  createdAt: string;
  resolvedAt?: string;
  timeline?: Array<{ type: string; description: string; timestamp: string }>;
}

export interface PostMortemInvestigationInput {
  id: string;
  intents: string;
  status: string;
  conclusionSummary?: string;
  hypotheses?: Array<{ description: string; confidence: number }>;
  evidence?: Array<{ type: string; summary?: string }>;
}

export interface PostMortemExecutionResult {
  action: string;
  targetService: string;
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface PostMortemVerificationOutcome {
  outcome: string;
  reasoning: string;
  nextSteps: string[];
}

export interface PostMortemInput {
  incident: PostMortemIncidentInput;
  investigations: PostMortemInvestigationInput[];
  executionResults?: PostMortemExecutionResult[];
  verificationOutcomes?: PostMortemVerificationOutcome[];
}
