import React from 'react';
import type { HypothesisSummary } from './ConclusionPanel.js';

interface Props {
  hypotheses: HypothesisSummary[];
}

const STATUS_BADGE: Record<HypothesisSummary['status'], string> = {
  supported: 'bg-emerald-900/30 text-emerald-400',
  refuted: 'bg-red-900/30 text-red-400',
  investigating: 'bg-amber-900/30 text-amber-400',
  proposed: 'bg-[var(--color-outline-variant)] text-[var(--color-on-surface-variant)]',
  inconclusive: 'bg-[var(--color-outline-variant)] text-[var(--color-outline)]',
};

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color =
    pct > 70 ? 'bg-emerald-500' : pct > 40 ? 'bg-amber-400' : 'bg-[var(--color-outline)]';

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[var(--color-outline-variant)] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-[var(--color-on-surface-variant)] w-8 text-right">{pct}%</span>
    </div>
  );
}

export default function HypothesisList({ hypotheses }: Props) {
  if (!hypotheses.length) {
    return <p className="text-sm text-[var(--color-on-surface-variant)]">No hypotheses generated.</p>;
  }

  return (
    <div className="space-y-3">
      {hypotheses.map((h) => (
        <div key={h.id} className="p-3 bg-[var(--color-surface-highest)] rounded-lg border border-[var(--color-outline-variant)]">
          <div className="flex items-start justify-between gap-2 mb-2">
            <p className="text-sm text-[var(--color-on-surface)] flex-1">{h.description}</p>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUS_BADGE[h.status]}`}>
              {h.status}
            </span>
          </div>
          <ConfidenceBar value={h.confidence} />
        </div>
      ))}
    </div>
  );
}
