import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

interface HistogramBucket {
  le: string;
  count: number;
}

interface Props {
  buckets: HistogramBucket[];
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(1)}G`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export default function HistogramVisualization({ buckets }: Props) {
  const data = useMemo(() => {
    if (!buckets.length) return [];

    // Convert cumulative histogram buckets to per-bucket counts
    const sorted = [...buckets].sort((a, b) => {
      const anum = a.le === '+Inf' ? Infinity : parseFloat(a.le);
      const bnum = b.le === '+Inf' ? Infinity : parseFloat(b.le);
      return anum - bnum;
    });

    const results: Array<{ label: string; count: number }> = [];
    let prev = 0;
    for (const b of sorted) {
      if (b.le === '+Inf') continue;
      const delta = Math.max(0, b.count - prev);
      results.push({ label: b.le, count: delta });
      prev = b.count;
    }

    return results;
  }, [buckets]);

  if (data.length === 0) {
    return <div className="text-xs text-[var(--color-outline)] italic py-4 text-center">No data</div>;
  }

  return (
    <div className="bg-[var(--color-surface-highest)] rounded-lg p-2">
      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 0, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-outline-variant)" horizontal />
          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 10 }}
            axisLine={{ stroke: 'var(--color-outline-variant)' }}
            tickLine={false}
            interval={data.length > 12 ? Math.floor(data.length / 8) : 0}
          />
          <YAxis
            tickFormatter={formatValue}
            tick={{ fill: 'var(--color-on-surface-variant)', fontSize: 11 }}
            axisLine={{ stroke: 'var(--color-outline-variant)' }}
            tickLine={false}
            width={45}
          />
          <Tooltip
            cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null;
              const d = payload[0]?.payload as { label: string; count: number };
              return (
                <div className="bg-[var(--color-surface-highest)] border border-[var(--color-outline-variant)] rounded-lg px-3 py-2 shadow-xl text-xs">
                  <div className="text-[var(--color-on-surface-variant)] mb-0.5">{d.label}</div>
                  <div className="text-[var(--color-on-surface)] font-mono font-semibold">{formatValue(d.count ?? 0)}</div>
                </div>
              );
            }}
          />
          <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40} fill="var(--color-primary)" fillOpacity={0.85} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
