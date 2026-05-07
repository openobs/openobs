/**
 * Filterable combobox for picking a model id.
 *
 * Replaces the old `<input list="...">`/`<datalist>` pattern, which
 * silently breaks in Chrome when the option list grows past ~100
 * entries (OpenRouter returns ~370 models). The native dropdown stops
 * appearing — the user sees the ▼ glyph but clicking does nothing.
 *
 * This is a minimal controlled combobox: a free-text input with an
 * absolutely-positioned filtered popup. Same interaction model as the
 * old datalist (type to filter, click to pick, free-text fallback when
 * the model id isn't in the list), but the popup renders independently
 * of browser quirks.
 *
 * Keyboard:
 *   - ↑/↓: move highlight
 *   - Enter: select highlighted option
 *   - Esc: close popup, keep current input value
 */
import { useEffect, useRef, useState } from 'react';

export interface ModelOption {
  id: string;
  label: string;
}

interface ModelComboboxProps {
  value: string;
  onChange: (next: string) => void;
  options: ModelOption[];
  placeholder?: string;
  /** Tailwind classes applied to the wrapped <input>. */
  inputClassName?: string;
  /** Tailwind classes applied to the outer wrapper (controls popup positioning). */
  className?: string;
}

const MAX_VISIBLE_OPTIONS = 80;

export function ModelCombobox({
  value,
  onChange,
  options,
  placeholder,
  inputClassName,
  className,
}: ModelComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside the wrapper.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  // Filter: case-insensitive substring on id + label. When input is
  // empty, show all options (capped). Result is capped at
  // MAX_VISIBLE_OPTIONS so a 370-item provider doesn't render a
  // multi-thousand-pixel popup.
  const q = value.trim().toLowerCase();
  const filtered = q.length === 0
    ? options.slice(0, MAX_VISIBLE_OPTIONS)
    : options.filter((o) => o.id.toLowerCase().includes(q) || o.label.toLowerCase().includes(q)).slice(0, MAX_VISIBLE_OPTIONS);

  function commit(next: string) {
    onChange(next);
    setOpen(false);
    inputRef.current?.blur();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (e.key === 'ArrowDown') {
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlight((h) => Math.max(0, h - 1));
      e.preventDefault();
    } else if (e.key === 'Enter' && open && filtered[highlight]) {
      commit(filtered[highlight].id);
      e.preventDefault();
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ''}`}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        className={inputClassName}
        aria-autocomplete="list"
        aria-expanded={open}
      />
      {open && filtered.length > 0 && (
        <ul
          className="absolute z-20 mt-1 left-0 right-0 max-h-72 overflow-auto rounded-lg border border-[var(--color-outline-variant)] bg-[var(--color-surface-high)] shadow-lg text-sm"
          role="listbox"
        >
          {filtered.map((opt, i) => (
            <li
              key={opt.id}
              role="option"
              aria-selected={i === highlight}
              // mousedown not click — fires before input.blur, preventing the
              // focus race that would close the popup before the click lands.
              onMouseDown={(e) => { e.preventDefault(); commit(opt.id); }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-3 py-1.5 cursor-pointer truncate ${
                i === highlight
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-on-surface)]'
                  : 'text-[var(--color-on-surface)] hover:bg-[var(--color-surface)]'
              }`}
              title={opt.label}
            >
              <span className="font-mono">{opt.id}</span>
              {opt.label && opt.label !== opt.id && (
                <span className="ml-2 text-xs text-tertiary">{opt.label}</span>
              )}
            </li>
          ))}
          {filtered.length === MAX_VISIBLE_OPTIONS && (
            <li className="px-3 py-1.5 text-xs text-tertiary border-t border-[var(--color-outline-variant)]/50">
              Showing first {MAX_VISIBLE_OPTIONS} matches — type to narrow.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
