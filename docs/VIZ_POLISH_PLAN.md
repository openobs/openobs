# Visualization Polish Plan — Match Grafana Quality

Goal: bring prism's panels (stat / time-series / heatmap / gauge) up to Grafana
visual + information density. Issues identified by side-by-side comparison with
production Grafana dashboards.

Work splits across three layers:

- **Schema** (`packages/web/src/components/panel/types.ts`) — fields the agent
  can emit and the viz can read.
- **Viz** (`packages/web/src/components/viz/*`) — render the new fields.
- **Agent** (panel-generation prompt + JSON schema) — emit the new fields by
  default with sensible per-panel defaults.

Order matters: schema → viz → agent. Agent changes are wasted until the viz
can render what they emit.

---

## P0 — Heatmap is broken

The current heatmap renders as a uniform pale-blue block because (a) the agent
generates raw `*_bucket` queries with no `rate()`, (b) the viz doesn't
de-cumulate Prometheus histogram buckets, and (c) linear color scaling collapses
under outliers.

### T-001 · Heatmap: de-cumulate histogram buckets

- **File:** `packages/web/src/components/panel/query-transformers.ts`
  (`rangeToHeatmapPoints`)
- **Change:** detect series whose y-label is a Prometheus `le` bucket. Group
  series by timestamp, sort by numeric `le` ascending, then for each timestamp
  emit `value[i] = cumulative[i] - cumulative[i-1]` (lowest bucket keeps its
  raw value). `+Inf` is the top bucket; treat it as the overflow row.
- **Acceptance:** for a stable latency histogram, the heatmap shows a clearly
  brighter band where most requests fall (typical p50 region) and dimmer
  bands at the tails — not a uniform color.

### T-002 · Heatmap: non-linear color scaling

- **File:** `packages/web/src/components/viz/HeatmapViz.tsx` (`rampColor` +
  the cell-paint loop around line 310)
- **Change:** add `colorScale: 'linear' | 'sqrt' | 'log'` prop, default `sqrt`.
  Apply the scale to the normalized value before indexing into the ramp:
  `t' = sqrt(t)` or `t' = log1p(t * (e - 1))`.
- **Acceptance:** when one cell is 100× others, the small cells are still
  visibly distinguishable from empty.

### T-003 · Agent: wrap histogram bucket queries in `rate()`

- **Files:** panel-generation prompt + JSON schema (in `packages/agent` or
  wherever the panel generator lives — needs locating).
- **Change:** when target metric ends in `_bucket`, the emitted PromQL must be
  `sum by (le) (rate(<metric>[$__rate_interval]))`. Same rule for `_count`
  used as request-rate. Document this in the prompt with a worked example.
- **Acceptance:** newly generated heatmap panels have `rate(...[1m])` (or
  `$__rate_interval`) wrapping the bucket selector.

---

## P1 — Stat panel feels flat

The current stat panel shows a small number, no trend context, and no visual
hierarchy on the unit. Grafana stat panels are immediately scannable because
the number is huge, the unit hangs as a smaller suffix, and a faint sparkline
hints at recent trend.

### T-010 · Schema: add stat polish fields

- **File:** `packages/web/src/components/panel/types.ts`
- **Add to `PanelConfig`:**
  ```ts
  sparkline?: boolean;          // stat only
  colorMode?: 'value' | 'background' | 'none'; // stat only
  graphMode?: 'none' | 'area';  // stat sparkline style
  ```
- **Add to `PanelSnapshotData`:** a `sparkline` field with `{timestamps, values}`
  so snapshot panels can render the trend without a re-fetch.

### T-011 · DashboardPanelCard: fetch sparkline data for stat panels

- **File:** `packages/web/src/components/DashboardPanelCard.tsx`
- **Change:** when `panel.visualization === 'stat' && panel.sparkline`, also
  issue a range query (alongside the instant query) over the active timeRange
  and pass the resulting series to `<StatViz sparkline={...} />`.
- **Acceptance:** stat panels with `sparkline: true` show a faint area chart
  spanning the full panel width behind the number.

### T-012 · StatViz: bigger number + suffix unit + sparkline render

- **File:** `packages/web/src/components/viz/StatViz.tsx`
- **Changes:**
  1. Number font-size scales with container (use `clamp(2rem, 14cqw, 5rem)`
     via container queries, or measure container and pick a size).
  2. Split unit into a smaller, muted suffix: e.g. `550` (huge) + ` K` (60%
     size, on-surface-variant). Reuse the formatter's `prefix/suffix` fields
     from `lib/format`.
  3. Render `sparkline` prop as a faint area chart filling the bottom 40% of
     the panel, using the resolved threshold color at 0.18 opacity.
  4. `colorMode: 'background'` paints the whole panel background in a heavily
     muted threshold color; `'value'` (default) only colors the number.
- **Acceptance:** Side-by-side with Grafana — number dominates the panel,
  unit is visibly smaller and lighter, sparkline visible but doesn't compete
  with the number.

### T-013 · Agent: default stat panels to sparkline + colorMode

- **Change:** panel-generation prompt teaches that all `stat` panels should
  default to `sparkline: true`, `colorMode: 'value'`, `graphMode: 'area'`
  unless the metric has no meaningful time evolution (e.g. a constant pod
  count — those should use a gauge or simple stat).

---

## P1 — Time-series chart density

Grafana time-series feel professional because lines are thin, fills are subtle,
grid is barely-there, and the legend packs Mean/Max/Last inline. Ours look
chunky and the legend gives only the current value.

### T-020 · Schema: add line/legend polish fields

- **File:** `packages/web/src/components/panel/types.ts`
- **Add to `PanelConfig`:**
  ```ts
  lineWidth?: number;            // default 1
  fillOpacity?: number;          // already exists; ensure it's wired to viz
  showPoints?: 'auto' | 'never';
  legendStats?: Array<'last' | 'mean' | 'max' | 'min'>;
  legendPlacement?: 'bottom' | 'right';
  ```

### T-021 · TimeSeriesViz + UPlotConfigBuilder: thin lines + area fill

- **Files:**
  - `packages/web/src/components/viz/TimeSeriesViz.tsx`
  - `packages/web/src/lib/uplot/config-builder.ts`
- **Changes:**
  1. Default `VIZ_TOKENS.series.lineWidth` to `1` (currently `1.5`).
  2. Wire `fillOpacity` from PanelConfig through `buildViz` → uPlot
     `series.fill` (gradient or flat alpha around 0.08–0.18).
  3. Lighter grid: drop `VIZ_TOKENS.grid.color` opacity from `0.12` → `0.06`.
- **Acceptance:** chart reads as a clean line drawing, grid is present but
  doesn't compete with data, area fill gives shape without dominating.

### T-022 · TimeSeriesViz: legend stats columns

- **File:** `packages/web/src/components/viz/TimeSeriesViz.tsx` (`LegendLayer`)
- **Change:** `list` mode currently shows `name + last`. Honor the new
  `legendStats` prop — render an inline group of `Mean: 703K  Last: 457K
  Max: 941K` after the name, in tabular-nums monospace, on-surface-variant
  color. `table` mode already does this; harmonize the two modes' formatting.
- **Acceptance:** for a multi-series panel with `legendStats: ['mean','last','max']`,
  legend matches Grafana's "Cache hits / misses" panel layout.

### T-023 · Legend: multi-column wrap at narrow widths

- **File:** `packages/web/src/components/viz/TimeSeriesViz.tsx` (`LegendLayer`)
- **Change:** `list` mode already uses flex-wrap; ensure each item has a
  `min-width: 220px` so wrapping produces tidy columns instead of jagged rows.
  Cap legend container `max-height: 33%` of chart container; overflow scrolls.
- **Acceptance:** a panel with 12 series wraps the legend into 2–3 columns;
  doesn't squeeze the chart below ~50% of the panel.

### T-024 · Agent: emit lineWidth + legendStats per panel intent

- **Change:** panel-generation prompt gets a small decision table:
  - error rate / saturation panels → `legendStats: ['mean','max']`
  - request rate / counter panels → `legendStats: ['last','mean']`
  - latency percentile panels → `legendStats: ['last','mean','max']`
  - default `lineWidth: 1`, `fillOpacity: 0.1` for area-style panels.

---

## P2 — Information architecture

### T-030 · Render `description` as a hover info icon

- **File:** `packages/web/src/components/DashboardPanelCard.tsx`
- **Change:** `panel.description` already lives in PanelConfig but is rendered
  as a paragraph below the title (and only on non-stat panels). Replace with
  a small `ⓘ` icon next to the title that shows the description in a tooltip
  on hover. Apply to both stat and standard layouts.
- **Acceptance:** matches Grafana's `(i)` icon placement.

### T-031 · Tighten panel padding + grid margins

- **Files:**
  - `packages/web/src/components/DashboardGrid.tsx` (`margin={[16, 16]}`
    → `[8, 8]`)
  - `packages/web/src/components/DashboardPanelCard.tsx` (panel `px-4 py-3`
    → `px-3 py-2`, `pb-1.5` → `pb-1`)
- **Acceptance:** dashboard reads denser without panels touching each other.

### T-032 · Compound stat (e.g. "available / unavailable")

- Grafana renders Pod Count as a donut + two values (2224 available / 0
  unavailable) inside one panel.
- **Schema:** allow `stat` panels to take multiple instant queries and render
  them side-by-side with their `legendFormat` strings as sublabels.
- **Viz:** `StatViz` learns a `compound` mode that renders 2–3 mini-stats
  horizontally with a thin separator. Reuses existing per-stat sparkline +
  colorMode logic.
- **Agent:** when the user asks for "X available / unavailable" or
  "ready / not-ready" patterns, prefer compound stat over two separate panels.
- **Acceptance:** matches the Pod Count panel layout from the reference
  screenshot.

---

## Cross-cutting

### T-040 · CSS-var resolution for canvas-rendered viz

Already done for uPlot ([config-builder.ts](packages/web/src/lib/uplot/config-builder.ts)
`resolveCssVar`). Audit `HeatmapViz.tsx` for hardcoded hex
(`'#94a3b8'`, `'rgba(148,163,184,0.7)'`) and route them through the same
helper or move to `VIZ_TOKENS` so theme changes don't strand colors.

### T-041 · Snapshot back-fill for new fields

When the schema gains `sparkline`, `legendStats`, etc., the snapshot capture
path (`PanelSnapshotData`) and the snapshot replay path (effect at
`DashboardPanelCard.tsx:313`) must both round-trip the new fields. Otherwise
saved investigations regress to the old look.

---

## Suggested execution order (1 engineer, ~1.5 weeks)

1. **Day 1–2:** T-010, T-020 (schema only — unblocks parallel work).
2. **Day 2–3:** T-001, T-002 (heatmap viz — independent, biggest visual win).
3. **Day 3–5:** T-011, T-012 (stat sparkline + typography).
4. **Day 5–6:** T-021, T-022, T-023 (time-series polish + legend stats).
5. **Day 6–7:** T-030, T-031, T-040 (info icon + density + audit).
6. **Day 7–8:** T-003, T-013, T-024 (agent prompt updates — needs all viz
   capability landed first so prompts can reference it).
7. **Day 8–9:** T-032 (compound stat — last because it's the deepest schema
   change).
8. **Day 9–10:** T-041 + manual end-to-end verification on a real dashboard.

## Out of scope (track separately)

- New visualization types (sankey, geomap, candlestick).
- Theming / light-mode support — the CSS-var resolution work in T-040 is the
  prerequisite, but a separate effort owns the actual theme tokens.
- Per-series overrides (Grafana's "field overrides"). Useful but a much
  bigger schema lift; defer until users ask.
