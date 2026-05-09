import React from 'react';
import ReactDOM from 'react-dom';
import type { PanelConfig } from './DashboardPanelCard.js';
import type { DashboardVariable } from '../hooks/useDashboardChat.js';

interface Dashboard {
  id: string;
  title: string;
  description?: string;
  prompt: string;
  status: 'generating' | 'ready' | 'error';
  type?: string;
  panels: PanelConfig[];
  variables?: DashboardVariable[];
  createdAt: string;
  updatedAt?: string;
  folder?: string;
}

function toGrafana(dash: Dashboard): unknown {
  return {
    __inputs: [{ name: 'DS_PROMETHEUS', label: 'Prometheus', type: 'datasource', pluginId: 'prometheus' }],
    title: dash.title,
    description: dash.description ?? '',
    tags: ['rounds-export'],
    timezone: 'browser',
    editable: true,
    panels: (dash.panels ?? []).map((p, i) => ({
      id: i + 1,
      title: p.title,
      description: p.description ?? '',
      type: p.visualization === 'time_series' ? 'timeseries'
        : p.visualization === 'stat' ? 'stat'
        : p.visualization === 'gauge' ? 'gauge'
        : p.visualization === 'bar' ? 'barchart'
        : p.visualization === 'pie' ? 'piechart'
        : p.visualization === 'table' ? 'table'
        : p.visualization === 'heatmap' ? 'heatmap'
        : p.visualization === 'histogram' ? 'histogram'
        : 'timeseries',
      gridPos: { h: p.height ?? 8, w: p.width ?? 12, x: p.col ?? 0, y: p.row ?? 0 },
      targets: (p.queries ?? []).map((q, qi) => ({
        refId: q.refId || String.fromCharCode(65 + qi),
        expr: q.expr,
        legendFormat: q.legendFormat ?? '',
        datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
        instant: q.instant ?? false,
      })),
      fieldConfig: { defaults: { unit: p.unit ?? 'short' } },
      datasource: { type: 'prometheus', uid: '${DS_PROMETHEUS}' },
    })),
    templating: { list: (dash.variables ?? []).map((v) => ({
      name: v.name, label: v.label ?? v.name, type: 'query', query: v.query ?? '',
      multi: false, includeAll: false,
    })) },
    time: { from: 'now-1h', to: 'now' },
    refresh: '30s',
    schemaVersion: 39,
    version: 1,
  };
}

function toPrometheusRules(dash: Dashboard): string {
  const rules = (dash.panels ?? [])
    .flatMap((p) => (p.queries ?? []).map((q) => ({
      record: `openobs:${p.title.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase()}`,
      expr: q.expr,
    })));
  return `groups:\n  - name: ${dash.title.replace(/[^a-zA-Z0-9_ -]/g, '')}\n    rules:\n${rules.map((r) => `      - record: ${r.record}\n        expr: ${r.expr}`).join('\n')}`;
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ExportMenu({ dashboard }: { dashboard: Dashboard }) {
  const [open, setOpen] = React.useState(false);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState({ top: 0, right: 0 });

  React.useEffect(() => {
    if (!open) return;
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const slug = dashboard.title.replace(/[^a-zA-Z0-9_-]/g, '_');
  const formats = [
    { label: 'Rounds JSON', desc: 'Native format', onClick: () => { downloadFile(JSON.stringify(dashboard, null, 2), `${slug}.json`, 'application/json'); setOpen(false); } },
    { label: 'Grafana JSON', desc: 'Import into Grafana', onClick: () => { downloadFile(JSON.stringify(toGrafana(dashboard), null, 2), `${slug}_grafana.json`, 'application/json'); setOpen(false); } },
    { label: 'Prometheus Rules', desc: 'Recording rules YAML', onClick: () => { downloadFile(toPrometheusRules(dashboard), `${slug}_rules.yml`, 'text/yaml'); setOpen(false); } },
  ];

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => setOpen(!open)}
        className="p-1.5 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-high transition-colors" title="Export">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </button>
      {open && ReactDOM.createPortal(
        <div ref={menuRef} className="fixed w-56 bg-surface-highest rounded-xl shadow-2xl shadow-black/40 py-1" style={{ top: pos.top, right: pos.right, zIndex: 9999 }}>
          <p className="px-3 py-1.5 text-[10px] font-bold text-on-surface-variant uppercase tracking-wider">Export as</p>
          {formats.map((f) => (
            <button key={f.label} type="button" onClick={f.onClick}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-bright transition-colors">
              <div className="flex-1">
                <div className="text-sm text-on-surface">{f.label}</div>
                <div className="text-[10px] text-on-surface-variant">{f.desc}</div>
              </div>
              <svg className="w-4 h-4 text-on-surface-variant shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
