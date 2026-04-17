/**
 * HistogramViz — polished histogram rendered with pure SVG.
 *
 * Accepts the canonical Prometheus cumulative-bucket shape and converts it
 * to per-bucket counts internally. Stays pure SVG (no uPlot) because
 * histogram bars are geometry-simple and every pixel — tick spacing, label
 * rotation, +Inf treatment — is easier to control by hand than to coax out
 * of a general-purpose chart library.
 *
 * Sibling of the legacy `HistogramVisualization.tsx` (which stays in place
 * for back-compat with older dashboards and keeps its recharts dependency).
 *
 * Geometry cheat sheet:
 *  - Left gutter (~44px) holds right-aligned y-axis tick labels.
 *  - Plot area holds the bars; bars touch edge-to-edge with a 1px visual
 *    gap provided by stroking each bar in the surface background color.
 *  - Below the plot sits one tick row — labels rotate -30° when bucket
 *    count ≥ 8 so adjacent boundary labels don't collide.
 *
 * Tick strategy (x-axis): show a label at every bucket boundary when there
 * are fewer than 8 buckets, otherwise every other boundary. Boundaries —
 * not bar centers — are the semantically meaningful ticks for a histogram.
 */
import React, { useMemo, useState } from 'react';
import { formatValueForDisplay } from '../../lib/format/index.js';
import { PALETTE, VIZ_TOKENS } from '../../lib/theme/index.js';

export interface HistogramBucket {
  /** Upper bound. `'+Inf'` for the open-ended top bucket. */
  le: string;
  /** Cumulative count at this upper bound (Prometheus convention). */
  count: number;
}

export interface HistogramVizProps {
  buckets: HistogramBucket[];
  /** Formatter id for x-axis (bucket bounds). e.g. `'s'`, `'bytes'`. */
  unit?: string;
  /** Formatter id for y-axis (counts). Default `'short'`. */
  countUnit?: string;
  /** Bar fill color. Default `PALETTE.blue.base`. */
  color?: string;
  /** Pixel height of the SVG. Default `220`. */
  height?: number;
}

/** Default viewBox width; SVG stretches to fill its container horizontally. */
const WIDTH = 640;

/** Internal representation: a resolved numeric boundary pair + count. */
interface Bar {
  /** Numeric lower bound. `-Infinity` if this is the bottom bucket. */
  lower: number;
  /** Numeric upper bound. `Infinity` for the `+Inf` bucket. */
  upper: number;
  /** Per-bucket count (cumulative delta, clamped non-negative). */
  count: number;
  /** Whether the original `le` was `'+Inf'`. */
  isInf: boolean;
}

/**
 * "Nice" tick generator producing ~`target` round ticks covering `[min, max]`.
 * Uses the classic 1/2/5 × 10^k step ladder so tick values look hand-picked.
 */
function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
    return [min];
  }
  const range = max - min;
  const roughStep = range / Math.max(1, target);
  const pow10 = Math.pow(10, Math.floor(Math.log10(roughStep)));
  const normalized = roughStep / pow10;
  let step: number;
  if (normalized >= 5) step = 10 * pow10;
  else if (normalized >= 2) step = 5 * pow10;
  else if (normalized >= 1) step = 2 * pow10;
  else step = pow10;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step * 0.5; v += step) {
    // Trim floating-point dust so labels show "5" not "5.000000000001".
    ticks.push(Number(v.toPrecision(12)));
  }
  return ticks;
}

/** Parse a Prometheus `le` string to a numeric bound. */
function parseLe(le: string): number {
  if (le === '+Inf' || le === 'Inf' || le === '+inf') return Infinity;
  return parseFloat(le);
}

/**
 * Convert cumulative Prometheus buckets to per-bucket bars.
 * Input order-independent; sorts ascending by upper bound. Negative deltas
 * (which in practice indicate counter resets or label churn) are clamped
 * to zero rather than propagated as a visual glitch.
 */
function toBars(buckets: HistogramBucket[]): Bar[] {
  if (buckets.length === 0) return [];
  const sorted = [...buckets]
    .map((b) => ({ ...b, _bound: parseLe(b.le) }))
    .filter((b) => Number.isFinite(b._bound) || b._bound === Infinity)
    .sort((a, b) => a._bound - b._bound);

  const bars: Bar[] = [];
  let prevCount = 0;
  let prevBound = -Infinity;
  for (const b of sorted) {
    const delta = Math.max(0, b.count - prevCount);
    bars.push({
      lower: prevBound,
      upper: b._bound,
      count: delta,
      isInf: b._bound === Infinity,
    });
    prevCount = b.count;
    prevBound = b._bound;
  }
  return bars;
}

/** Format the `[lo, hi)` range for a bar's tooltip and axis use. */
function rangeLabel(bar: Bar, unit: string | undefined): string {
  if (bar.isInf) {
    // Bottom is -Infinity theoretically impossible here (there'd be a lower
    // bucket), but guard anyway.
    const lo = Number.isFinite(bar.lower)
      ? formatValueForDisplay(bar.lower, unit)
      : '0';
    return `\u2265 ${lo}`;
  }
  const lo = Number.isFinite(bar.lower)
    ? formatValueForDisplay(bar.lower, unit)
    : formatValueForDisplay(0, unit);
  const hi = formatValueForDisplay(bar.upper, unit);
  return `${lo}\u2013${hi}`;
}

export default function HistogramViz({
  buckets,
  unit,
  countUnit,
  color = PALETTE.blue.base,
  height = 220,
}: HistogramVizProps): React.JSX.Element {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const bars = useMemo(() => toBars(buckets), [buckets]);

  if (bars.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: VIZ_TOKENS.axis.color,
          fontSize: VIZ_TOKENS.axis.labelFontSize,
          fontStyle: 'italic',
        }}
      >
        No data
      </div>
    );
  }

  const axisColor = VIZ_TOKENS.axis.color;
  const gridColor = VIZ_TOKENS.grid.color;
  const labelFont = VIZ_TOKENS.axis.labelFontSize;
  const tickFont = VIZ_TOKENS.axis.tickFontSize;

  // Layout: rotate x tick labels when there are enough buckets that adjacent
  // boundaries would crowd horizontally, and when we're keeping every label.
  const rotateXLabels = bars.length >= 8;
  const xTickStride = bars.length >= 8 ? 2 : 1;

  const padTop = 12;
  const padLeft = 48;
  const padRight = 12;
  const padBottom = rotateXLabels ? 54 : 30;

  const plotX0 = padLeft;
  const plotX1 = WIDTH - padRight;
  const plotW = Math.max(1, plotX1 - plotX0);
  const plotY0 = padTop;
  const plotY1 = height - padBottom;
  const plotH = Math.max(1, plotY1 - plotY0);

  const barW = plotW / bars.length;

  // Y domain: from 0 up to the max count. If all counts are zero, pick 1 so
  // the axis still renders meaningful ticks instead of a degenerate line.
  const maxCount = bars.reduce((m, b) => Math.max(m, b.count), 0);
  const yMax = maxCount === 0 ? 1 : maxCount;
  const yTicks = niceTicks(0, yMax, 4);
  // Expand yMax to the top tick so bars never overshoot the axis.
  const yAxisMax = Math.max(yMax, yTicks[yTicks.length - 1] ?? yMax);

  const scaleY = (v: number): number =>
    plotY1 - (v / yAxisMax) * plotH;

  /**
   * Boundary formatter. For the left edge of the bottom-most bar we show
   * its upper bound's formatted value only if the lower bound is finite;
   * otherwise we fall back to "0" which is conventional for Prometheus
   * histograms starting at 0.
   */
  const formatBoundary = (bar: Bar, side: 'lower' | 'upper'): string => {
    if (side === 'upper') {
      if (bar.isInf) return '\u221E';
      return formatValueForDisplay(bar.upper, unit);
    }
    if (!Number.isFinite(bar.lower)) return formatValueForDisplay(0, unit);
    return formatValueForDisplay(bar.lower, unit);
  };

  return (
    <svg
      role="img"
      viewBox={`0 0 ${WIDTH} ${height}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height, display: 'block' }}
    >
      {/* Y gridlines + tick labels */}
      {yTicks.map((t, i) => {
        const y = scaleY(t);
        return (
          <g key={`gy-${i}`}>
            <line
              x1={plotX0}
              x2={plotX1}
              y1={y}
              y2={y}
              stroke={gridColor}
              strokeWidth={VIZ_TOKENS.grid.lineWidth}
            />
            <text
              x={plotX0 - 6}
              y={y}
              fontSize={tickFont}
              fill={axisColor}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {formatValueForDisplay(t, countUnit ?? 'short')}
            </text>
          </g>
        );
      })}

      {/* Bars. Each bar sits flush against its neighbors; a 1px stroke in the
          axis color (low-opacity) provides the visual separator. We also keep
          a full-height invisible hit target per bar so the hover tooltip
          triggers on the whole column, not just the filled portion. */}
      {bars.map((bar, i) => {
        const x = plotX0 + barW * i;
        const yTop = scaleY(bar.count);
        const h = Math.max(0, plotY1 - yTop);
        const isHover = hoverIdx === i;
        return (
          <g
            key={`bar-${i}`}
            onMouseEnter={() => setHoverIdx(i)}
            onMouseLeave={() => setHoverIdx(null)}
            style={{ cursor: 'default' }}
          >
            <title>
              {`[${rangeLabel(bar, unit)}]: ${formatValueForDisplay(
                bar.count,
                countUnit ?? 'short',
              )}`}
            </title>
            {/* Full-column hit target. */}
            <rect
              x={x}
              y={plotY0}
              width={barW}
              height={plotH}
              fill="transparent"
            />
            <rect
              x={x}
              y={yTop}
              width={Math.max(0, barW - 1)}
              height={h}
              fill={color}
              fillOpacity={isHover ? 1 : 0.82}
            />
          </g>
        );
      })}

      {/* X-axis boundary labels. Ticks sit at bar edges (boundaries), not
          centers. We always render the leftmost boundary (start of bucket
          0), then step by `xTickStride` through the upper boundaries. */}
      {bars.map((bar, i) => {
        if (i % xTickStride !== 0) return null;
        const x = plotX0 + barW * (i + 1); // right edge = upper bound
        const label = formatBoundary(bar, 'upper');
        const labelY = plotY1 + (rotateXLabels ? 10 : 16);
        return (
          <text
            key={`xt-${i}`}
            x={x}
            y={labelY}
            fontSize={tickFont}
            fill={axisColor}
            textAnchor={rotateXLabels ? 'end' : 'middle'}
            transform={
              rotateXLabels ? `rotate(-30 ${x} ${labelY})` : undefined
            }
          >
            {label}
          </text>
        );
      })}

      {/* Leftmost boundary (lower bound of first bar). Shown once; without it
          users can't tell where bucket 0 starts. */}
      {(() => {
        const first = bars[0];
        if (!first) return null;
        const x = plotX0;
        const label = formatBoundary(first, 'lower');
        const labelY = plotY1 + (rotateXLabels ? 10 : 16);
        return (
          <text
            x={x}
            y={labelY}
            fontSize={tickFont}
            fill={axisColor}
            textAnchor={rotateXLabels ? 'end' : 'middle'}
            transform={
              rotateXLabels ? `rotate(-30 ${x} ${labelY})` : undefined
            }
          >
            {label}
          </text>
        );
      })()}

      {/* Baseline (y = 0). */}
      <line
        x1={plotX0}
        x2={plotX1}
        y1={plotY1}
        y2={plotY1}
        stroke={axisColor}
        strokeOpacity={0.4}
        strokeWidth={1}
      />
    </svg>
  );
}
