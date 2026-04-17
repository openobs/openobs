/**
 * Adapters from raw Prometheus HTTP responses to `DataFrame`s. These are
 * deliberately small and stateless — the caller chooses a `refId` / `unit`
 * on a per-call basis.
 *
 * The Prometheus response shape we consume is declared in
 * `../../components/panel/types.js`, which is the authoritative definition
 * for the rest of the codebase. We import the interfaces here so the new
 * data layer stays in lock-step with the existing transformer code.
 */
import type {
  InstantResponse,
  PrometheusInstantResult,
  PrometheusRangeResult,
  RangeResponse,
} from '../../components/panel/types.js';
import type { DataFrame, Field, FieldConfig } from './types.js';

export interface TransformOptions {
  refId?: string;
  unit?: string;
}

/** Prometheus range-value timestamps are seconds; the UI works in ms. */
const SECONDS_TO_MS = 1000;

function parseSample(raw: string): number | null {
  const n = Number.parseFloat(raw);
  return Number.isNaN(n) ? null : n;
}

function seriesDisplayName(labels: Record<string, string>): string {
  const metricName = labels['__name__'];
  const rest: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(labels)) {
    if (k !== '__name__') rest.push([k, v]);
  }
  const pairs = rest.map(([k, v]) => `${k}="${v}"`).join(',');
  if (metricName !== undefined && metricName !== '') {
    return pairs.length > 0 ? `${metricName}{${pairs}}` : metricName;
  }
  if (pairs.length > 0) return `{${pairs}}`;
  return 'value';
}

function rangeResultToFrame(
  r: PrometheusRangeResult,
  opts: TransformOptions,
): DataFrame {
  const samples = r.values ?? [];
  const timestamps: number[] = new Array(samples.length);
  const values: Array<number | null> = new Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const [ts, raw] = samples[i]!;
    timestamps[i] = ts * SECONDS_TO_MS;
    values[i] = parseSample(raw);
  }

  const timeField: Field<number> = {
    name: 'time',
    type: 'time',
    values: timestamps,
    config: {},
  };

  const name = seriesDisplayName(r.metric);
  const valueConfig: FieldConfig = {};
  if (opts.unit !== undefined) valueConfig.unit = opts.unit;
  const valueField: Field<number | null> = {
    name,
    type: 'number',
    values,
    config: valueConfig,
    labels: { ...r.metric },
  };

  const frame: DataFrame = {
    name,
    fields: [timeField, valueField],
    length: samples.length,
  };
  if (opts.refId !== undefined) frame.refId = opts.refId;
  if (opts.unit !== undefined) frame.meta = { unit: opts.unit };
  return frame;
}

/**
 * One frame per Prometheus series. Each frame has exactly two fields
 * (`time`, then the value column named after the series' labels) so it is
 * directly renderable by a time-series chart.
 */
export function rangeResponseToFrames(
  resp: RangeResponse,
  opts: TransformOptions,
): DataFrame[] {
  const results = resp?.data?.result ?? [];
  const frames: DataFrame[] = new Array(results.length);
  for (let i = 0; i < results.length; i += 1) {
    frames[i] = rangeResultToFrame(results[i]!, opts);
  }
  return frames;
}

/**
 * Wide-format table: one column per distinct label key across all results,
 * plus a trailing numeric `Value` column. Row `i` is the i-th series in the
 * response. Suitable for tabular display (table / bar / pie / gauge-list).
 *
 * Row count equals the number of results. Timestamps are intentionally
 * dropped — instant queries collapse to a single point per series, and the
 * timestamp isn't useful as a table column.
 */
export function instantResponseToFrame(
  resp: InstantResponse,
  opts: TransformOptions,
): DataFrame {
  const results: PrometheusInstantResult[] = resp?.data?.result ?? [];

  // Collect label keys in first-seen order across all rows so the column
  // layout is deterministic.
  const labelKeys: string[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    for (const k of Object.keys(r.metric)) {
      if (!seen.has(k)) {
        seen.add(k);
        labelKeys.push(k);
      }
    }
  }

  const labelFields: Field<string | null>[] = labelKeys.map((key) => ({
    name: key,
    type: 'string',
    values: results.map((r) => {
      const v = r.metric[key];
      return v === undefined ? null : v;
    }),
    config: {},
  }));

  const valueConfig: FieldConfig = {};
  if (opts.unit !== undefined) valueConfig.unit = opts.unit;
  const valueField: Field<number | null> = {
    name: 'Value',
    type: 'number',
    values: results.map((r) => parseSample(r.value[1])),
    config: valueConfig,
  };

  const frame: DataFrame = {
    fields: [...labelFields, valueField],
    length: results.length,
  };
  if (opts.refId !== undefined) frame.refId = opts.refId;
  if (opts.unit !== undefined) frame.meta = { unit: opts.unit };
  return frame;
}
