import React, { useState } from 'react';
import type { AskUserOption } from '../../hooks/useDashboardChat.js';

// Renders a structured ask_user prompt: a question plus a horizontal row of
// clickable option buttons. Once the user picks an option the entire group
// becomes inert and visually dimmed except the chosen button — that gives
// persistent context in the chat history about which choice was made.

interface Props {
  question: string;
  options: AskUserOption[];
  onSelect: (id: string) => void;
}

export default function AskUserPrompt({ question, options, onSelect }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const disabled = selectedId !== null;

  const handleClick = (id: string) => {
    if (disabled) return;
    setSelectedId(id);
    onSelect(id);
  };

  return (
    <div className="my-3 text-[15px] leading-relaxed text-on-surface">
      <div className="mb-3">{question}</div>
      <div className="flex flex-wrap gap-2">
        {options.map((opt, i) => {
          const isSelected = selectedId === opt.id;
          // Until a selection is made, the first button gets primary fill
          // contrast and the rest are outline. After a selection only the
          // chosen button stays highlighted; the others fade.
          const isPrimary = !disabled && i === 0;
          const baseClasses =
            'inline-flex flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left text-sm transition-all';
          const enabledClasses = isPrimary
            ? 'bg-primary text-white border border-primary hover:scale-[1.02]'
            : 'bg-transparent text-on-surface border border-outline-variant hover:bg-surface-high hover:scale-[1.02]';
          const selectedClasses = isSelected
            ? 'bg-primary/15 text-on-surface border border-primary'
            : 'bg-transparent text-on-surface-variant border border-outline-variant opacity-60';
          const className = `${baseClasses} ${disabled ? selectedClasses : enabledClasses} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleClick(opt.id)}
              disabled={disabled}
              className={className}
              aria-pressed={isSelected}
            >
              <span className="font-medium">{opt.label}</span>
              {opt.hint && (
                <small className="text-[11px] opacity-80 leading-tight">{opt.hint}</small>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
