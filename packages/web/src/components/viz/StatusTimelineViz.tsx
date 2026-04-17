/**
 * StatusTimelineViz — state-over-time swimlanes rendered as pure SVG.
 *
 * One row per label (service/host/etc.), with colored rectangles painted
 * across a shared time axis to show status transitions. Paired with the
 * legacy `StatusTimelineVisualization.tsx`, which stays for back-compat;
 * this sibling uses `PALETTE` / `VIZ_TOKENS` and adds hover affordances,
 * adaptive tick formatting, and a label gutter with ellipsized truncation.
 *
 * Geometry cheat sheet:
 *  - Label gutter: right-aligned, truncated to ~20 chars at 11px.
 *  - Row height 20px + 8px vertical padding between rows.
 *  - X-axis at bottom: 4–6 "nice" ticks. Uses HH:MM when span fits in a
 *    day, falls back to "YYYY-MM-DD HH:MM" when > 24h are covered.
 *  - Each span: rounded `<rect rx=3>` with min visible width of 2px so
 *    transient states stay visible in wide ranges.
 */
import React, { useMemo, useState } from 'react';
import { formatValueForDisplay } from '../../lib/format/index.js';
import { PALETTE, VIZ_TOKENS } from '../../lib/theme/index.js';

export interface StatusSpan {
  label: string;
  /** Start time, ms since epoch. */
  start: number;
  /** End time, ms since epoch. */
  end: number;
  /** Case-insensitive status keyword. See `statusColor` for recognized values. */
  status: string;
}

export interface StatusTimelineVizProps {
  spans: StatusSpan[];
  /** SVG pixel height. Defaults to `rows * 28 + axis (28)`. */
  height?: number;
  /** Per-status color override (keyed by lower-case status). */
  colors?: Record<string, string>;
}

/** Row height for each span bar (rect). */
const ROW_BAR_H = 20;
/** Vertical padding between rows (total band = ROW_BAR_H + ROW_PAD). */
const ROW_PAD = 8;
/** Height reserved under the last row for x-axis tick labels. */
const AXIS_H = 28;
/** Left gutter width in px for label column. */
const LABEL_GUTTER = 128;
/** Right padding in px, so the final tick label doesn't clip. */
const RIGHT_PAD = 16;
/** Character budget for the right-aligned row label. */
const LABEL_CHAR_BUDGET = 20;
/** Minimum visible span width in px. Clamps sub-pixel states to 2px. */
const MIN_SPAN_W = 2;
/** Default SVG viewBox width. The SVG scales via `width: 100%`. */
const DEFAULT_WIDTH = 720;

function truncate(label: string, max: number): string {
  if (label.length <= max) return label;
  return `${label.slice(0, Math.max(0, max - 1))}\u2026`;
}

function statusColor(
  status: string,
  overrides: Record<string, string> | undefined,
): string {
  const key = status.toLowerCase();
  if (overrides) {
    const override = overrides[key];
    if (override !== undefined) return override;
  }
  switch (key) {
    case 'up':
    case 'ok':
    case 'healthy':
    case 'success':
      return PALETTE.green.base;
    case 'degraded':
    case 'warning':
    case 'slow':
      return PALETTE.yellow.base;
    case 'down':
    case 'critical':
    case 'error':
    case 'fail':
      return PALETTE.red.base;
    case 'maintenance':
      return PALETTE.blue.base;
    case 'unknown':
      return 'var(--color-outline)';
    default:
      return 'var(--color-outline-variant)';
  }
}

/** "Nice" tick generator over a time range producing ~`target` round marks. */
function niceTimeTicks(min: number, max: number, target = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const range = max - min;
  const roughStep = range / Math.max(1, target);
  // Snap to common calendar-ish intervals (in ms) for readability.
  const steps = [
    1_000, 5_000, 10_000, 30_000,
    60_000, 5 * 60_000, 10 * 60_000, 15 * 60_000, 30 * 60_000,
    3_600_000, 2 * 3_600_000, 6 * 3_600_000, 12 * 3_600_000,
    86_400_000, 2 * 86_400_000, 7 * 86_400_000,
  ] as const;
  let step: number = steps[steps.length - 1] ?? 86_400_000;
  for (const s of steps) {
    if (s >= roughStep) {
      step = s;
      break;
    }
  }
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    ticks.push(v);
  }
  // Guarantee endpoints for context on very narrow ranges.
  if (ticks.length < 2) return [min, max];
  return ticks;
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

function formatTick(ts: number, multiDay: boolean): string {
  const d = new Date(ts);
  const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  if (!multiDay) return hm;
  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return `${ymd} ${hm}`;
}

function formatFullTime(ts: number): string {
  const d = new Date(ts);
  const ymd = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const hms = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  return `${ymd} ${hms}`;
}

interface Row {
  label: string;
  displayLabel: string;
  spans: StatusSpan[];
}

export default function StatusTimelineViz({
  spans,
  height,
  colors,
}: StatusTimelineVizProps): React.JSX.Element {
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverSpan, setHoverSpan] = useState<string | null>(null);

  const { rows, timeMin, timeMax } = useMemo(() => {
    if (!spans.length) {
      return {
        rows: [] as Row[],
        timeMin: 0,
        timeMax: 0,
      };
    }
    // Stable first-seen order; within a row, sort ascending by start.
    const order: string[] = [];
    const byLabel = new Map<string, StatusSpan[]>();
    let tMin = Infinity;
    let tMax = -Infinity;
    for (const s of spans) {
      if (!byLabel.has(s.label)) {
        byLabel.set(s.label, []);
        order.push(s.label);
      }
      byLabel.get(s.label)!.push(s);
      if (s.start < tMin) tMin = s.start;
      if (s.end > tMax) tMax = s.end;
    }
    const out: Row[] = order.map((label) => ({
      label,
      displayLabel: truncate(label, LABEL_CHAR_BUDGET),
      spans: byLabel.get(label)!.slice().sort((a, b) => a.start - b.start),
    }));
    return { rows: out, timeMin: tMin, timeMax: tMax };
  }, [spans]);

  const axisColor = VIZ_TOKENS.axis.color;
  const labelFont = VIZ_TOKENS.axis.labelFontSize;
  const tickFont = VIZ_TOKENS.axis.tickFontSize;

  if (rows.length === 0) {
    return (
      <div
        style={{
          width: '100%',
          height: height ?? 120,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: axisColor,
          fontSize: labelFont,
          fontStyle: 'italic',
        }}
      >
        No data
      </div>
    );
  }

  const band = ROW_BAR_H + ROW_PAD;
  const svgH = height ?? rows.length * band + AXIS_H;
  const width = DEFAULT_WIDTH;
  const plotX0 = LABEL_GUTTER;
  const plotX1 = width - RIGHT_PAD;
  const plotW = Math.max(1, plotX1 - plotX0);
  const plotY0 = 4;
  const plotY1 = svgH - AXIS_H;
  // Guard: if caller supplies a tiny `height` that would zero-out rows,
  // still lay the rows out on their natural band and let the SVG clip.
  const rowsY0 = plotY0;

  const duration = Math.max(1, timeMax - timeMin);
  const multiDay = duration > 24 * 3_600_000;

  const scaleX = (ts: number): number =>
    plotX0 + ((ts - timeMin) / duration) * plotW;

  const ticks = niceTimeTicks(timeMin, timeMax, 5);

  return (
    <svg
      role="img"
      viewBox={`0 0 ${width} ${svgH}`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: svgH, display: 'block' }}
    >
      {/* Row hover highlight (painted under everything else). */}
      {hoverRow !== null && (
        <rect
          x={0}
          y={rowsY0 + hoverRow * band}
          width={width}
          height={band}
          fill="var(--color-surface-high)"
          opacity={0.4}
        />
      )}

      {/* Rows: label gutter + span bars. */}
      {rows.map((row, ri) => {
        const yCenter = rowsY0 + ri * band + band / 2;
        const yRect = yCenter - ROW_BAR_H / 2 + 2; // inset 2px top/bottom
        const rectH = ROW_BAR_H - 4;
        return (
          <g
            key={row.label}
            onMouseEnter={() => setHoverRow(ri)}
            onMouseLeave={() => setHoverRow((v) => (v === ri ? null : v))}
          >
            <title>{row.label}</title>
            {/* Full-row hit target so hover covers gaps between spans. */}
            <rect
              x={0}
              y={rowsY0 + ri * band}
              width={width}
              height={band}
              fill="transparent"
            />
            {/* Right-aligned, truncated label. */}
            <text
              x={LABEL_GUTTER - 10}
              y={yCenter}
              fontSize={labelFont}
              fill={axisColor}
              textAnchor="end"
              dominantBaseline="middle"
            >
              {row.displayLabel}
            </text>
            {/* Subtle gutter baseline so empty rows still read as rows. */}
            <rect
              x={plotX0}
              y={yRect}
              width={plotW}
              height={rectH}
              rx={3}
              ry={3}
              fill="var(--color-surface-high)"
              opacity={0.35}
            />
            {/* Span bars. */}
            {row.spans.map((s, si) => {
              const safeEnd = s.end > s.start ? s.end : s.start + 1;
              const x0 = scaleX(s.start);
              const x1 = scaleX(safeEnd);
              const w = Math.max(MIN_SPAN_W, x1 - x0);
              const id = `${ri}:${si}`;
              const isHover = hoverSpan === id;
              const fill = statusColor(s.status, colors);
              const durSec = (s.end - s.start) / 1000;
              const durFmt = formatValueForDisplay(Math.max(0, durSec), 's');
              const tip = `${s.label} \u2014 ${s.status} \u2014 ${formatFullTime(
                s.start,
              )} \u2192 ${formatFullTime(s.end)} (${durFmt})`;
              return (
                <g
                  key={id}
                  onMouseEnter={() => setHoverSpan(id)}
                  onMouseLeave={() =>
                    setHoverSpan((v) => (v === id ? null : v))
                  }
                  style={{ cursor: 'default' }}
                >
                  <title>{tip}</title>
                  <rect
                    x={x0}
                    y={yRect}
                    width={w}
                    height={rectH}
                    rx={3}
                    ry={3}
                    fill={fill}
                    fillOpacity={isHover ? 1 : 0.85}
                  />
                </g>
              );
            })}
          </g>
        );
      })}

      {/* X-axis tick labels at the bottom. */}
      {ticks.map((t, i) => {
        const x = scaleX(t);
        // Nudge endpoint labels inward so they don't clip on the viewBox.
        const anchor: 'start' | 'middle' | 'end' =
          i === 0 ? 'start' : i === ticks.length - 1 ? 'end' : 'middle';
        return (
          <g key={`tk-${i}`}>
            <line
              x1={x}
              x2={x}
              y1={plotY1}
              y2={plotY1 + 4}
              stroke={axisColor}
              strokeOpacity={0.5}
              strokeWidth={1}
            />
            <text
              x={x}
              y={plotY1 + 18}
              fontSize={tickFont}
              fill={axisColor}
              textAnchor={anchor}
            >
              {formatTick(t, multiDay)}
            </text>
          </g>
        );
      })}

      {/* Axis baseline under the last row. */}
      <line
        x1={plotX0}
        x2={plotX1}
        y1={plotY1}
        y2={plotY1}
        stroke={axisColor}
        strokeOpacity={0.35}
        strokeWidth={1}
      />
    </svg>
  );
}
