import type { PanelQuery, RangeResponse, InstantResponse, QueryResult } from './types.js';

export function transformQueryResult(data: RangeResponse, pq: PanelQuery): QueryResult {
  const results = data?.data?.result ?? [];
  return {
    refIds: pq.refId,
    legendFormat: pq.legendFormat,
    series: results.map((r) => ({
      labels: r.metric,
      points: (r.values ?? []).map(([ts, val]) => ({ ts: ts * 1000, value: Number.parseFloat(val) })),
    })),
    totalSeries: results.length,
  };
}

export function transformInstantData(data: InstantResponse, query: string) {
  return {
    query,
    series: data.data.result.map((r) => ({
      labels: r.metric,
      points: [{ ts: r.value[0] * 1000, value: Number.parseFloat(r.value[1]) }],
    })),
    totalSeries: data.data.result.length,
  };
}

export function firstInstantValue(data: InstantResponse | null): number {
  const raw = data?.data?.result?.[0]?.value?.[1];
  return raw === undefined ? 0 : Number.parseFloat(raw);
}

export function instantToBarItems(data: InstantResponse | null): Array<{ label: string; value: number }> {
  if (!data) return [];
  return data.data.result.map((r) => {
    const labelEntries = Object.entries(r.metric).filter(([k]) => k !== '__name__');
    const label =
      labelEntries.length > 0
        ? labelEntries.slice(0, 2).map(([, v]) => v).join('/')
        : r.metric['__name__'] ?? 'series';
    return { label, value: Number.parseFloat(r.value[1]) };
  });
}

export function instantToPieItems(data: InstantResponse | null): Array<{ label: string; value: number }> {
  if (!data) return [];
  return data.data.result.map((r) => {
    const labelEntries = Object.entries(r.metric).filter(([k]) => k !== '__name__');
    const label =
      labelEntries.length > 0
        ? labelEntries.slice(0, 2).map(([, v]) => v).join('/')
        : r.metric['__name__'] ?? 'series';
    return { label, value: Number.parseFloat(r.value[1]) };
  });
}

export function instantToHistogramBuckets(data: InstantResponse | null): Array<{ le: string; count: number }> {
  if (!data) return [];
  return data.data.result
    .filter((r) => r.metric['le'] != null)
    .map((r) => ({ le: r.metric['le']!, count: Number.parseFloat(r.value[1]) }))
    .sort((a, b) => {
      const an = a.le === '+Inf' ? Infinity : Number.parseFloat(a.le);
      const bn = b.le === '+Inf' ? Infinity : Number.parseFloat(b.le);
      return an - bn;
    });
}

export function rangeToHeatmapPoints(results: QueryResult[]): Array<{ x: number; y: string; value: number }> {
  // Detect histogram-style input: every series carries an `le` label. In that
  // case we must de-cumulate — Prometheus histogram buckets are cumulative, so
  // the raw cell value for bucket `le=0.5` includes every request under 0.5s,
  // not just the ones between the previous bucket and 0.5s. Rendering cumulative
  // values makes a heatmap look flat (every row is a copy of the rows below it
  // plus a delta), which is exactly the "one solid color" symptom reported.
  const allHaveLe =
    results.length > 0 &&
    results.every((qr) => qr.series.length > 0 && qr.series.every((s) => s.labels['le'] != null));

  if (allHaveLe) {
    return histogramRangeToHeatmapPoints(results);
  }

  const points: Array<{ x: number; y: string; value: number }> = [];
  for (const qr of results) {
    for (const s of qr.series) {
      const entries = Object.entries(s.labels).filter(([k]) => k !== '__name__');
      const yLabel =
        entries.length > 0
          ? entries.slice(0, 2).map(([, v]) => v).join('/')
          : s.labels['__name__'] ?? 'series';
      for (const p of s.points) {
        points.push({ x: p.ts, y: yLabel, value: p.value });
      }
    }
  }
  return points;
}

/**
 * De-cumulated heatmap points for Prometheus histograms.
 *
 * For each timestamp we sort the buckets by numeric `le` ascending and emit
 * `density[i] = cumulative[i] - cumulative[i-1]` for i>=1, keeping the lowest
 * bucket's raw value for i=0. Negative deltas (which can occur if a counter
 * resets between scrapes) are clamped to 0. Missing samples at a timestamp
 * are skipped rather than synthesized.
 */
function histogramRangeToHeatmapPoints(
  results: QueryResult[],
): Array<{ x: number; y: string; value: number }> {
  // Flatten into per-(le, timestamp) records so we can rebuild a matrix.
  interface Bucket {
    le: string;
    leNum: number; // +Inf → Infinity
    byTs: Map<number, number>;
  }
  const buckets = new Map<string, Bucket>();
  for (const qr of results) {
    for (const s of qr.series) {
      const le = s.labels['le']!;
      const existing = buckets.get(le);
      const bucket: Bucket = existing ?? {
        le,
        leNum: le === '+Inf' ? Number.POSITIVE_INFINITY : Number.parseFloat(le),
        byTs: new Map<number, number>(),
      };
      if (!existing) buckets.set(le, bucket);
      for (const p of s.points) {
        if (Number.isFinite(p.value)) bucket.byTs.set(p.ts, p.value);
      }
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => a.leNum - b.leNum);
  if (sorted.length === 0) return [];

  // Union of timestamps across all buckets — individual buckets may miss a
  // sample if the scrape was incomplete.
  const allTs = new Set<number>();
  for (const b of sorted) for (const t of b.byTs.keys()) allTs.add(t);
  const tsList = [...allTs].sort((a, b) => a - b);

  const points: Array<{ x: number; y: string; value: number }> = [];
  for (const ts of tsList) {
    let prev = 0;
    let seenLower = false;
    for (const b of sorted) {
      const cumulative = b.byTs.get(ts);
      if (cumulative === undefined) continue;
      const density = seenLower ? Math.max(0, cumulative - prev) : cumulative;
      points.push({ x: ts, y: b.le, value: density });
      prev = cumulative;
      seenLower = true;
    }
  }
  return points;
}

export function rangeToStatusSpans(results: QueryResult[]): Array<{ label: string; start: number; end: number; status: string }> {
  const spans: Array<{ label: string; start: number; end: number; status: string }> = [];
  for (const qr of results) {
    for (const s of qr.series) {
      const labelEntries = Object.entries(s.labels).filter(([k]) => k !== '__name__');
      const label =
        labelEntries.length > 0
          ? labelEntries.slice(0, 2).map(([, v]) => v).join('/')
          : s.labels['__name__'] ?? 'series';
      let spanStart = 0;
      let lastStatus = '';
      for (let i = 0; i < s.points.length; i += 1) {
        const p = s.points[i]!;
        const status = p.value === 1 ? 'up' : p.value === 0 ? 'down' : String(p.value);
        if (i === 0) {
          lastStatus = status;
          spanStart = p.ts;
        } else if (status !== lastStatus) {
          spans.push({ label, start: spanStart, end: p.ts, status: lastStatus });
          spanStart = p.ts;
          lastStatus = status;
        }
      }
      if (s.points.length > 0) {
        const last = s.points[s.points.length - 1]!;
        spans.push({ label, start: spanStart, end: last.ts, status: lastStatus });
      }
    }
  }
  return spans;
}
