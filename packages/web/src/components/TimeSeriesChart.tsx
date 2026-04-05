import React, { useMemo, useState, useCallback } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface TimeSeriesPoint {
  ts: number;
  value: number;
}

interface TimeSeriesData {
  labels: Record<string, string>;
  points: TimeSeriesPoint[];
}

interface ExtendedSeriesData extends TimeSeriesData {
  refId?: string;
  legendFormat?: string;
}

interface MetricEvidenceResult {
  query: string;
  series: TimeSeriesData[];
  totalSeries: number;
}

type MultiQueryResult = Array<{
  refId?: string;
  legendFormat?: string;
  series: TimeSeriesData[];
  totalSeries: number;
}>;

function isMetricEvidence(r: unknown): r is MetricEvidenceResult {
  return typeof r === 'object' && r !== null && 'series' in r && Array.isArray((r as MetricEvidenceResult).series);
}

function isMultiQueryResult(r: unknown): r is MultiQueryResult {
  return (
    Array.isArray(r) &&
    r.every(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        'series' in item &&
        Array.isArray((item as MultiQueryResult[number]).series),
    )
  );
}

const REFID_COLORS: Record<string, string[]> = {
  A: ['#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#eab308', '#22d3ee', '#f472b6', '#fb923c'],
  B: ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ef4444', '#34d399', '#f97316', '#38bdf8'],
  C: ['#a855f7', '#ef4444', '#22c55e', '#3b82f6', '#eab308', '#f472b6', '#22d3ee', '#fb923c'],
  D: ['#eab308', '#fb923c', '#ef4444', '#a855f7', '#3b82f6', '#22c55e', '#22d3ee', '#f472b6'],
};

const COLORS = ['#22c55e', '#3b82f6', '#a855f7', '#ef4444', '#eab308', '#22d3ee', '#f472b6', '#fb923c', '#34d399', '#a3a6ff'];

function formatValue(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  const abs = Math.abs(v);
  if (abs >= 1e9) return `${(v / 1e9).toFixed(1)}G`;
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (abs > 0 && abs < 1e-6) return `${(v * 1e9).toFixed(1)}n`;
  if (abs >= 1e-6 && abs < 1e-3) return `${(v * 1e6).toFixed(1)}u`;
  if (abs >= 1e-3 && abs < 1) return `${(v * 1e3).toFixed(1)}m`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

function seriesLabel(labels: Record<string, string>): string {
  const entries = Object.entries(labels).filter(([k]) => k !== '__name__');
  if (entries.length === 0) return labels.__name__ ?? 'series';
  return entries.slice(0, 3).map(([, v]) => v).join(' / ');
}

function resolveLabel(s: ExtendedSeriesData): string {
  if (s.legendFormat) {
    return s.legendFormat.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) => s.labels[key] ?? key);
  }
  return seriesLabel(s.labels);
}

interface Props {
  result: unknown;
  height?: number;
  stackMode?: 'none' | 'normal' | 'percent';
  unit?: string;
}

function formatValueWithUnit(v: number, unit?: string): string {
  if (Number.isNaN(v)) return 'NaN';

  if (unit === 'seconds') {
    const abs = Math.abs(v);
    if (abs > 0 && abs < 1e-6) {
      return `${(v * 1e9).toFixed(1)} ns`;
    }
    if (abs >= 1e-6 && abs < 1e-3) {
      return `${(v * 1e6).toFixed(1)} us`;
    }
    if (abs >= 1e-3 && abs < 1) {
      const ms = v * 1000;
      return `${ms.toFixed(Math.abs(ms) < 10 ? 1 : 0)} ms`;
    }
    return abs < 10 ? `${v.toFixed(3)} s` : `${v.toFixed(2)} s`;
  }

  return formatValue(v);
}

export default function TimeSeriesChart({ result, height = 200, stackMode, unit }: Props) {
  if (isMultiQueryResult(result)) {
    const allSeries: ExtendedSeriesData[] = [];
    let totalSeries = 0;
    for (const qr of result) {
      for (const s of qr.series) {
        allSeries.push({ ...s, refId: qr.refId, legendFormat: qr.legendFormat });
      }
      totalSeries += qr.totalSeries;
    }

    if (allSeries.length === 0) {
      return <div className="mt-2 text-xs text-[var(--color-on-surface-variant)] italic">No data</div>;
    }

    const isInstant = allSeries.every((s) => s.points.length === 1);
    if (isInstant) {
      return <InstantTable series={allSeries} totalSeries={totalSeries} unit={unit} />;
    }

    return <RechartsArea series={allSeries} totalSeries={totalSeries} height={height} stackMode={stackMode} unit={unit} />;
  }

  if (!isMetricEvidence(result)) return null;
  const { series, query, totalSeries } = result;

  if (series.length === 0) {
    return <div className="mt-2 px-3 text-xs text-[var(--color-on-surface-variant)] italic break-all">No data returned for <span className="font-mono text-[var(--color-outline)]">{query}</span></div>;
  }

  const isInstant = series.every((s) => s.points.length === 1);
  if (isInstant) {
    return <InstantTable series={series} totalSeries={totalSeries} unit={unit} />;
  }

  return <RechartsArea series={series} totalSeries={totalSeries} height={height} stackMode={stackMode} unit={unit} />;
}

function InstantTable({ series, totalSeries, unit }: { series: ExtendedSeriesData[]; totalSeries: number; unit?: string }) {
  return (
    <div className="mt-2 bg-surface-highest rounded-lg p-3 space-y-1">
      {series.slice(0, 10).map((s, i) => (
        <div key={i} className="flex items-center justify-between text-xs gap-2">
          <span className="text-[var(--color-on-surface-variant)] truncate flex-1">{resolveLabel(s)}</span>
          <span className="font-mono font-semibold text-[var(--color-on-surface)]">{formatValueWithUnit(s.points[0]?.value ?? 0, unit)}</span>
        </div>
      ))}
      {totalSeries > 10 && <div className="text-xs text-[var(--color-outline)] mt-1">+{totalSeries - 10} more series</div>}
    </div>
  );
}

function RechartsArea({
  series,
  totalSeries,
  height,
  stackMode,
  unit,
}: {
  series: ExtendedSeriesData[];
  totalSeries: number;
  height: number;
  stackMode?: 'none' | 'normal' | 'percent';
  unit?: string;
}) {
  const displaySeries = series.slice(0, 10);
  const isStacked = stackMode === 'normal' || stackMode === 'percent';
  const [hiddenSeries, setHiddenSeries] = useState<Set<number>>(new Set());

  const toggleSeries = useCallback((idx: number) => {
    setHiddenSeries((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const { chartData, seriesKeys } = useMemo(() => {
    const tsMap = new Map<number, Record<string, number>>();
    const keys: string[] = [];

    displaySeries.forEach((s, i) => {
      const key = `s${i}`;
      keys.push(key);
      for (const p of s.points) {
        let row = tsMap.get(p.ts);
        if (!row) {
          row = { ts: p.ts };
          tsMap.set(p.ts, row);
        }
        row[key] = p.value;
      }
    });

    let data = Array.from(tsMap.values()).sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));

    if (stackMode === 'percent') {
      data = data.map((row) => {
        const total = keys.reduce((sum, k) => sum + (row[k] ?? 0), 0);
        if (!total) return row;
        const normalized = { ...row, ts: row.ts } as Record<string, number>;
        for (const k of keys) normalized[k] = ((row[k] ?? 0) / total) * 100;
        return normalized;
      });
    }

    return { chartData: data, seriesKeys: keys };
  }, [displaySeries, stackMode]);

  const seriesColors = useMemo(() => {
    const refIdCounters: Record<string, number> = {};
    return displaySeries.map((s) => {
      const refId = s.refId ?? 'A';
      const colors = REFID_COLORS[refId] ?? COLORS;
      const idx = refIdCounters[refId] ?? 0;
      refIdCounters[refId] = idx + 1;
      return colors[idx % colors.length];
    });
  }, [displaySeries]);

  const seriesLabels = useMemo(() => displaySeries.map((s) => resolveLabel(s)), [displaySeries]);

  return (
    <div className="h-full rounded-lg p-2">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 8, right: 12, bottom: 20, left: 8 }}>
          {seriesKeys.map((key, i) => (
            <defs key={`grad-${key}`}>
              <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={seriesColors[i]} stopOpacity={isStacked ? 0.6 : 0.4} />
                <stop offset="95%" stopColor={seriesColors[i]} stopOpacity={0} />
              </linearGradient>
            </defs>
          ))}
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" strokeOpacity={0.3} />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={formatTime}
            tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--color-outline-variant)' }}
            tickLine={false}
          />
          <YAxis
            tickFormatter={stackMode === 'percent' ? (v: number) => `${v.toFixed(0)}%` : (v: number) => formatValueWithUnit(v, unit)}
            tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--color-outline-variant)' }}
            tickLine={false}
            width={50}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || payload.length === 0) return null;
              return (
                <div className="bg-[var(--color-surface-highest)] border border-[var(--color-outline-variant)] rounded-lg px-3 py-2 shadow-xl text-xs">
                  <p className="text-[var(--color-on-surface-variant)] mb-1.5">{formatTime(label as number)}</p>
                  {payload.map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: entry.color }} />
                      <span className="text-[var(--color-on-surface)] truncate max-w-[140px]">
                        {seriesLabels[Number(entry.dataKey?.toString().replace('s', ''))] ?? String(entry.dataKey)}
                      </span>
                      <span className="text-[var(--color-on-surface)] font-mono font-semibold ml-auto">
                        {stackMode === 'percent'
                          ? `${(entry.value as number).toFixed(1)}%`
                          : formatValueWithUnit(entry.value as number, unit)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {seriesKeys.map((key, i) => (
            <Area
              key={key}
              type="monotone"
              dataKey={key}
              stroke={seriesColors[i]}
              strokeWidth={2}
              fill={`url(#grad-${key})`}
              dot={false}
              connectNulls
              hide={hiddenSeries.has(i)}
              {...(isStacked ? { stackId: 'stack' } : {})}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 px-2 pb-1">
        {seriesLabels.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggleSeries(i)}
            className={`flex items-center gap-1.5 text-xs transition-opacity ${
              hiddenSeries.has(i) ? 'opacity-30' : 'text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]'
            }`}
          >
            <span className="w-2 h-2 rounded-full inline-block shrink-0" style={{ backgroundColor: seriesColors[i] }} />
            <span className="truncate max-w-[200px]">{label}</span>
          </button>
        ))}
        {totalSeries > 10 && <span className="text-xs text-[var(--color-outline)]">+{totalSeries - 10} more</span>}
      </div>
    </div>
  );
}
