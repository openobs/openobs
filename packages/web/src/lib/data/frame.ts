/**
 * Pure helpers for building and inspecting `DataFrame`s. None of these
 * mutate their inputs.
 */
import type { DataFrame, Field, FieldConfig } from './types.js';

export interface CreateTimeSeriesFrameOptions {
  name?: string;
  timestamps: number[];
  values: number[];
  labels?: Record<string, string>;
  unit?: string;
  color?: string;
}

/**
 * Build a two-field time-series frame: `[time, value]`. The length of the
 * frame is `max(timestamps.length, values.length)`; if the two arrays have
 * different lengths (shouldn't normally happen) the shorter one is treated
 * as having `null` in the missing slots.
 */
export function createTimeSeriesFrame(opts: CreateTimeSeriesFrameOptions): DataFrame {
  const timeField: Field<number> = {
    name: 'time',
    type: 'time',
    values: opts.timestamps.slice(),
    config: {},
  };

  const valueConfig: FieldConfig = {};
  if (opts.unit !== undefined) valueConfig.unit = opts.unit;
  if (opts.color !== undefined) valueConfig.color = opts.color;

  const valueField: Field<number> = {
    name: opts.name ?? 'value',
    type: 'number',
    values: opts.values.slice(),
    config: valueConfig,
    ...(opts.labels !== undefined ? { labels: { ...opts.labels } } : {}),
  };

  const length = Math.max(timeField.values.length, valueField.values.length);

  const frame: DataFrame = {
    fields: [timeField, valueField],
    length,
  };
  if (opts.name !== undefined) frame.name = opts.name;
  return frame;
}

/** Find the first field of type `'time'`. */
export function getTimeField(frame: DataFrame): Field<number> | undefined {
  for (const f of frame.fields) {
    if (f.type === 'time') return f as Field<number>;
  }
  return undefined;
}

/** All number fields in the frame (time fields are excluded). */
export function getNumberFields(frame: DataFrame): Field<number>[] {
  const out: Field<number>[] = [];
  for (const f of frame.fields) {
    if (f.type === 'number') out.push(f as Field<number>);
  }
  return out;
}

/**
 * Resolve the name to show in a legend / tooltip for a field. Priority:
 *   1. explicit `field.config.displayName`
 *   2. a label-derived name — either `__name__{k="v",...}` (Prometheus
 *      convention) or `k=v, k2=v2` when there's no metric name
 *   3. the raw field name
 *
 * The `frame` argument is accepted for future use (e.g. a frame-level
 * override) and to match the shape of similar utilities elsewhere.
 */
export function getFieldDisplayName(field: Field, _frame: DataFrame): string {
  if (field.config.displayName !== undefined && field.config.displayName !== '') {
    return field.config.displayName;
  }

  const labels = field.labels;
  if (labels !== undefined) {
    const { __name__: metricName, ...rest } = labels;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(rest)) {
      parts.push(`${k}="${v}"`);
    }
    if (metricName !== undefined && metricName !== '') {
      return parts.length > 0 ? `${metricName}{${parts.join(',')}}` : metricName;
    }
    if (parts.length > 0) return parts.join(', ');
  }

  return field.name;
}
