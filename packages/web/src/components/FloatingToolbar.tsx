import React, { useEffect, useRef, useState } from 'react';
import type { PanelConfig } from './DashboardPanelCard.js';

interface Props {
  panels: PanelConfig[];
  editMode: boolean;
  onToggleEdit: () => void;
  onAddPanel: () => void;
  onScrollToPanel?: (panelId: string) => void;
  onExport?: () => void;
}

function Popover({
  anchor,
  children,
  onClose,
}: {
  anchor: 'top' | 'bottom';
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className={`absolute left-1/2 -translate-x-1/2 z-50 ${
        anchor === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
      }`}
    >
      <div className="bg-[var(--color-surface-high)] rounded-xl border border-[var(--color-outline-variant)] shadow-2xl shadow-black/40 p-2 min-w-[180px]">
        {children}
      </div>
    </div>
  );
}

function BarButton({
  icon,
  label,
  active,
  onClick,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`relative group p-2 rounded-lg transition-all duration-150 ${
        active
          ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
          : 'text-[var(--color-outline)] hover:text-[var(--color-on-surface)] hover:bg-[var(--color-surface-high)]'
      } ${className ?? ''}`}
    >
      {icon}
      <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 px-2 py-1 text-[10px] font-medium text-white bg-[#2A2A2E] rounded whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity">
        {label}
      </span>
    </button>
  );
}

export default function FloatingToolbar({
  panels,
  editMode,
  onToggleEdit,
  onAddPanel,
  onScrollToPanel,
  onExport,
}: Props) {
  const [showPanelList, setShowPanelList] = useState(false);

  return (
    <div className="inline-flex items-center gap-0.5 p-1 bg-[#111118] rounded-xl border border-[var(--color-outline-variant)]">
      <BarButton
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 3.22213L3.36 3.536L3 4.0303v0-.571L16.732 7.732V?z"
            />
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.732l3.121 1.012 2.6-6.2693.423 12 19.5c.46.4H.1537L.087-.967z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 123 3 0 11-6 0 3 0 0 66 z" />
            </svg>
          </svg>
        }
        label={editMode ? 'Editing - click to view' : 'Viewing - click to edit'}
        active={editMode}
        onClick={onToggleEdit}
      />

      <div className="w-px h-5 bg-[var(--color-outline-variant)] mx-0.5" />

      <BarButton
        icon={
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        }
        label="Add panel"
        onClick={onAddPanel}
      />

      <div className="relative">
        <BarButton
          icon={
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7h18M3 12h18M3 17h18"
              />
            </svg>
          }
          label={`${panels.length} panels`}
          active={showPanelList}
          onClick={() => setShowPanelList(!showPanelList)}
        />

        {showPanelList && (
          <Popover anchor="bottom" onClose={() => setShowPanelList(false)}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-outline)] px-2 py-1.5">
              Panels ({panels.length})
            </p>
            {panels.length === 0 ? (
              <p className="text-[var(--color-outline)] text-xs px-2 py-2">No panels yet</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-0.5">
                {panels.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onScrollToPanel?.(p.id);
                      setShowPanelList(false);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#BCC0D8] hover:bg-[var(--color-outline-variant)] hover:text-[var(--color-on-surface)] transition-colors truncate"
                  >
                    {p.title}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        )}
      </div>

      {onExport && (
        <>
          <div className="w-px h-5 bg-[var(--color-outline-variant)] mx-0.5" />
          <BarButton
            icon={
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            }
            label="Export JSON"
            onClick={onExport}
          />
        </>
      )}
    </div>
  );
}
