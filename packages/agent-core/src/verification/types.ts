import type { IMetricsAdapter } from '../adapters/index.js';

export type VerificationTargetKind = 'dashboard' | 'investigation_report' | 'alert_rule';
export type VerificationStatus = 'passed' | 'failed' | 'warning';

export interface VerificationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
  artifactKind: VerificationTargetKind;
  artifactId?: string;
}

export interface VerificationReport {
  status: VerificationStatus;
  targetKind: VerificationTargetKind;
  summary: string;
  issues: VerificationIssue[];
  checksRun: string[];
}

export interface VerificationContext {
  /** @deprecated Use metricsAdapter instead */
  prometheusUrl?: string;
  /** @deprecated Use metricsAdapter instead */
  prometheusHeaders?: Record<string, string>;
  metricsAdapter?: IMetricsAdapter;
}
