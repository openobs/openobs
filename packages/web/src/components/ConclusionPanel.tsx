import React from 'react';
import HypothesisList from './HypothesisList.js';

export interface RecommendedAction {
  label: string;
  strategy: 'suggest' | 'approve_required';
}

export interface HypothesisSummary {
  id: string;
  description: string;
  confidence: number;
  status: 'proposed' | 'investigating' | 'supported' | 'refuted' | 'inconclusive';
}

export interface ConclusionData {
  summary: string;
  rootCause: string | null;
  confidence: number;
  impact?: string;
  hypotheses: HypothesisSummary[];
  recommendedActions: RecommendedAction[];
}

interface Props {
  conclusion: ConclusionData;
}

export default function ConclusionPanel({ conclusion }: Props) {
  return (
    <div className="space-y-5">
      <div className="p-4 bg-[var(--color-primary)]/10 rounded-xl border border-[var(--color-primary)]/20">
        <h3 className="text-xs font-semibold text-[var(--color-primary)] uppercase tracking-wide mb-2">Summary</h3>
        <p className="text-sm text-[var(--color-on-surface)] leading-relaxed">{conclusion.summary}</p>
        {conclusion.rootCause && (
          <p className="mt-2 text-sm font-medium text-[var(--color-on-surface)]">
            Root cause: <span className="text-[var(--color-primary)]">{conclusion.rootCause}</span>
          </p>
        )}
      </div>

      {conclusion.impact && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wide mb-2">Impact</h3>
          <p className="text-sm text-[var(--color-on-surface)]">{conclusion.impact}</p>
        </div>
      )}

      {conclusion.hypotheses.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wide mb-3">Hypotheses</h3>
          <HypothesisList hypotheses={conclusion.hypotheses} />
        </div>
      )}

      {conclusion.recommendedActions.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-on-surface-variant)] uppercase tracking-wide mb-3">Recommended Actions</h3>
          <ul className="space-y-2">
            {conclusion.recommendedActions.map((action, i) => (
              <li key={i} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 text-xs px-2 py-0.5 rounded font-medium ${
                    action.strategy === 'approve_required'
                      ? 'bg-amber-900/30 text-amber-400'
                      : 'bg-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]'
                  }`}
                >
                  {action.strategy === 'approve_required' ? 'Approval needed' : 'Suggest'}
                </span>
                <span className="text-sm text-[var(--color-on-surface)]">{action.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
