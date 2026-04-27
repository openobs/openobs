import { useState } from 'react';
import type { DatasourceChoiceAlternative } from '../../hooks/useDashboardChat.js';

/**
 * Inline narration of the agent's datasource pick. Renders as a small chip
 * showing "Using {name}" plus a "switch ▼" affordance that expands a list
 * of alternatives. Picking an alternative submits `option:{altId}` back to
 * the agent (same wire protocol as ask_user buttons), so the agent treats
 * the click as a follow-up turn and can re-run with the new datasource.
 *
 * Stays visible after the user clicks — selection is recorded and the chip
 * shows "Switched to {altName}" so the conversation thread stays auditable.
 */
export interface DatasourceChoiceChipProps {
  chosenName: string;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  alternatives: DatasourceChoiceAlternative[];
  onSwitch: (altId: string, altName: string) => void;
}

export function DatasourceChoiceChip({
  chosenName,
  reason,
  confidence,
  alternatives,
  onSwitch,
}: DatasourceChoiceChipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [switched, setSwitched] = useState<string | null>(null);

  const handlePick = (altId: string, altName: string) => {
    setSwitched(altName);
    setOpen(false);
    onSwitch(altId, altName);
  };

  // High confidence renders muted (agent was sure); low confidence renders
  // accented so the user notices the suggestion is a guess.
  const accentClass = confidence === 'high'
    ? 'text-[var(--color-on-surface-variant)]'
    : 'text-[var(--color-primary)]';

  return (
    <div className="inline-flex flex-col gap-1 my-1">
      <div
        className="inline-flex items-center gap-2 rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface-high)] px-2.5 py-1 text-[11px]"
      >
        <DatabaseIcon className={`w-3 h-3 ${accentClass}`} />
        <span className={accentClass}>
          {switched ? 'Switched to' : 'Using'}{' '}
          <strong className="text-[var(--color-on-surface)]">{switched ?? chosenName}</strong>
        </span>
        {alternatives.length > 0 && !switched && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-[var(--color-primary)] hover:underline"
            aria-expanded={open}
          >
            switch ▾
          </button>
        )}
      </div>
      {!switched && reason && (
        <p className="text-[10px] text-[var(--color-on-surface-variant)]/60 px-2.5">{reason}</p>
      )}
      {open && alternatives.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1 px-2.5">
          {alternatives.map((alt) => (
            <button
              key={alt.id}
              type="button"
              onClick={() => handlePick(alt.id, alt.name)}
              className="rounded-full border border-[var(--color-outline-variant)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] text-[var(--color-on-surface)] hover:bg-[var(--color-surface-high)] hover:border-[var(--color-primary)] transition-colors"
            >
              {alt.name}
              {alt.environment && (
                <span className="text-[var(--color-on-surface-variant)] ml-1">· {alt.environment}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DatabaseIcon({ className }: { className?: string }): JSX.Element {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v6c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 11v6c0 1.66 4.03 3 9 3s9-1.34 9-3v-6" />
    </svg>
  );
}
