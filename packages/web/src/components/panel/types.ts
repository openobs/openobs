export interface PanelQuery {
  refId: string;
  expr: string;
  legendFormat?: string;
  instant?: boolean;
  datasourceId?: string;
}

export interface PanelThreshold {
  value: number;
  color: string;
  label?: string;
}

export interface PanelSnapshotData {
  range?: Array<{
    refId: string;
    legendFormat?: string;
    series: Array<{ labels: Record<string, string>; points: Array<{ ts: number; value: number }> }>;
    totalSeries: number;
  }>;
  instant?: {
    data: { result: Array<{ metric: Record<string, string>; value: [number, string] }> };
  };
  /**
   * Optional sparkline series for stat panels. Captured separately so a stat
   * panel can show its trend in snapshot mode without a follow-up range query.
   */
  sparkline?: { timestamps: number[]; values: number[] };
  capturedAt: string;
}

export type ColorMode = 'value' | 'background' | 'none';
export type GraphMode = 'none' | 'area';
export type ColorScale = 'linear' | 'sqrt' | 'log';
export type LegendStat = 'last' | 'mean' | 'max' | 'min';
export type LegendPlacement = 'bottom' | 'right';
export type BarGaugeMode = 'gradient' | 'lcd';

export interface PanelAnnotation {
  time: number;
  label: string;
  color?: string;
}

export interface PanelConfig {
  id: string;
  title: string;
  description?: string;
  queries?: PanelQuery[];
  visualization:
    | 'time_series'
    | 'stat'
    | 'table'
    | 'gauge'
    | 'bar'
    | 'bar_gauge'
    | 'pie'
    | 'histogram'
    | 'heatmap'
    | 'status_timeline';
  unit?: string;
  refreshIntervalSec?: number | null;
  thresholds?: PanelThreshold[];
  stackMode?: 'normal' | 'percent';
  fillOpacity?: number;
  decimals?: number;
  // ---- Stat panel polish ----
  /** Show a faint trend sparkline behind the number. Stat panels only. */
  sparkline?: boolean;
  /** Where the resolved threshold color is applied. Stat panels only. */
  colorMode?: ColorMode;
  /** Sparkline render style. `'area'` fills under the line. */
  graphMode?: GraphMode;
  // ---- Time-series polish ----
  /** Stroke width in CSS pixels. Default 1. */
  lineWidth?: number;
  /** Show point markers ('auto' = only when zoomed in tight). Default 'never'. */
  showPoints?: 'auto' | 'never';
  /**
   * Y-axis scale type. `undefined` (default) = auto: switch to log when the
   * series spans >3 orders of magnitude. `'linear'` always linear. `'log'`
   * always log (uPlot `distr: 3`).
   */
  yScale?: 'linear' | 'log';
  /** Stats to show after each legend entry, in order. */
  legendStats?: LegendStat[];
  /** Legend position relative to the chart. */
  legendPlacement?: LegendPlacement;
  // ---- Heatmap polish ----
  /** Color ramp scale. `'sqrt'` is the safest default for skewed data. */
  colorScale?: ColorScale;
  /** For histogram-mode heatmaps, drop all-zero rows (keeping the lowest
   *  occupied bucket and one row of headroom above the highest occupied
   *  bucket). Default `true` when unset; pass `false` to render every bucket. */
  collapseEmptyBuckets?: boolean;
  // ---- Bar gauge ----
  /** Single ceiling shared by every row in a bar_gauge panel. */
  barGaugeMax?: number;
  /** Bar-gauge fill style. Default `'gradient'`. */
  barGaugeMode?: BarGaugeMode;
  // ---- Annotations ----
  /** Vertical event markers on time-axis panels (time_series, heatmap). */
  annotations?: PanelAnnotation[];
  // Backward compat: v1 panels use single query string
  query?: string;
  // Grid placement - backend uses row/col/width/height, frontend aliases gridRow etc.
  row?: number;
  col?: number;
  width?: number;
  height?: number;
  gridRow?: number;
  gridCol?: number;
  gridWidth?: number;
  gridHeight?: number;
  // Section grouping
  sectionId?: string;
  sectionLabel?: string;
  /** When set, panel renders this static data instead of live queries. */
  snapshotData?: PanelSnapshotData;
}

export interface PrometheusRangeResult {
  metric: Record<string, string>;
  values: [number, string][];
}

export interface PrometheusInstantResult {
  metric: Record<string, string>;
  value: [number, string];
}

export interface RangeResponse {
  status: string;
  data: { result: PrometheusRangeResult[] };
}

export interface InstantResponse {
  status: string;
  data: { result: PrometheusInstantResult[] };
}

export interface QueryResult {
  refIds: string;
  legendFormat?: string;
  series: Array<{ labels: Record<string, string>; points: Array<{ ts: number; value: number }> }>;
  totalSeries: number;
  error?: string;
}
