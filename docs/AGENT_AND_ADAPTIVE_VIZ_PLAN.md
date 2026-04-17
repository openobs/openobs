# Agent Viz Selection + Adaptive Viz Plan

Goal: instead of racing to match Grafana's ~30 viz types, make our 9 existing
types (a) chosen smarter by the agent, and (b) self-adjust to the data they
receive. Add only the 1-2 missing types that are genuinely high-leverage.

Three workstreams:

- **Workstream A — Agent selection.** Prompt + tool work so the LLM picks the
  right viz given the metric semantics and the data shape.
- **Workstream B — Viz auto-adaptation.** Existing viz components inspect their
  inputs and switch layout/style without explicit config.
- **Workstream C — New high-leverage types.** Bar gauge (SLO ratios) +
  annotation overlay on time-series.

Order: B is independent and parallelizable, do it first. A depends on B
landing (the prompt can reference the adaptive defaults). C is last because
it's the largest schema lift.

---

## Workstream B — Viz auto-adaptation

### T-201 · TimeSeriesViz: adaptive legend mode

- **File:** [TimeSeriesViz.tsx](packages/web/src/components/viz/TimeSeriesViz.tsx)
- **Rule:**
  - `series.length <= 6` → list mode (current)
  - `7 <= series.length <= 20` → table mode (auto-switch even if `legend === 'list'`)
  - `series.length > 20` → table mode capped at top-15 by `last` value, with a
    "+N more" footer row that expands on click
- **Override:** explicit `panel.legendPlacement === 'right'` or
  `panel.legend === 'table'` honored as-is.
- **Acceptance:** a 30-series panel shows top-15 in a table, with last/mean/max
  columns; chart still gets ≥66% of panel height.

### T-202 · TimeSeriesViz: adaptive point markers

- **File:** [config-builder.ts](packages/web/src/lib/uplot/config-builder.ts)
  + [TimeSeriesViz.tsx](packages/web/src/components/viz/TimeSeriesViz.tsx)
- **Rule:** if `(plotWidthPx / dataPointCount) > 25` (i.e. each point owns >25
  CSS px of horizontal space → data is sparse), set
  `series[i].points.show = true` so resting markers appear at every sample.
  Default-off otherwise.
- **Why:** sparse time series with no markers looks like a continuous line
  hiding the fact that there are only 5 samples. Markers make sample
  cadence legible.
- **Acceptance:** a 1h range queried at 60s step (~60 points) on a 600px
  chart (10px/point) does not show markers; same query at 600s step
  (~6 points, 100px/point) shows them.

### T-203 · TimeSeriesViz: log scale auto-suggest

- **File:** [config-builder.ts](packages/web/src/lib/uplot/config-builder.ts)
- **Rule:** if `max(values) / min(values_nonzero) > 1000`, switch y scale to
  `distr: 3` (log) automatically — unless `panel.yScale === 'linear'` is set.
- **Acceptance:** a panel mixing 100ms baselines and 100s outliers renders
  with a log y so both bands are readable.

### T-204 · HeatmapViz: collapse empty rows for histograms

- **File:** [HeatmapViz.tsx](packages/web/src/components/viz/HeatmapViz.tsx)
- **Rule:** for histogram-mode heatmaps (already detected via `le` labels),
  drop rows whose every cell is 0 — including +Inf when it's empty. Keep
  the lowest occupied bucket and one row above the highest occupied bucket
  as visual context.
- **Rationale:** the "all requests under 100ms" case currently shows 9 empty
  rows above one bright row. Collapsing makes the heatmap actually use its
  vertical space.
- **Override:** `panel.collapseEmptyBuckets: false` to keep all buckets
  (rare; useful when comparing two heatmaps side-by-side).

### T-205 · StatViz: adaptive coloring for percentage near 100%

- **File:** [StatViz.tsx](packages/web/src/components/viz/StatViz.tsx)
- **Rule:** if `unit === 'percent' || unit === 'percentunit'` AND value >= 95
  AND `colorMode === 'value'` (default), switch to `colorMode === 'background'`
  with the resolved threshold color washed at 0.06 alpha. SLO panels read as
  big calm green numbers without the giant red number when an SLO drops to
  99.5% (still "good", just below 99.9%).
- **Acceptance:** a panel showing 99.9% with green threshold renders the
  number in normal `--color-on-surface` (not green-saturated) and the panel
  background is faintly green-tinted.

### T-206 · BarViz: top-N truncation with overflow indicator

- **File:** [BarViz.tsx](packages/web/src/components/viz/BarViz.tsx)
- **Rule:** if `items.length > maxItems` (default 15), show top-15 by value
  and a 16th row "... +N more" that's not a bar but a text marker. Prevents
  silent data loss when an agent accidentally generates a query with no
  `topk()` wrapper.
- **Acceptance:** a `sum by (handler) (rate(...))` returning 50 series renders
  15 bars + an overflow row.

### T-207 · PieViz: collapse small slices into "Other"

- **File:** [PieViz.tsx](packages/web/src/components/viz/PieViz.tsx)
- **Rule:** any slice < 1.5% of total folds into a single "Other" slice
  (gray). Cap at 8 visible categories regardless of total.
- **Acceptance:** a 30-series pie renders ≤8 slices + "Other".

---

## Workstream A — Agent selection

### T-210 · Prompt: metric-type → viz decision tree

- **File:** [orchestrator-prompt.ts](packages/agent-core/src/agent/orchestrator-prompt.ts)
- **Add** a "Viz Selection" subsection under "Panel Polish Defaults" that
  walks the LLM through:
  1. Inspect the metric via `prometheus.metadata` first — it returns
     `type: 'counter' | 'gauge' | 'histogram' | 'summary'`.
  2. Apply the rule:
     - **counter**: always wrap in `rate()`. Pick `time_series` for trend or
       `stat` for current rate.
     - **gauge** (resource utilization, queue depth): `time_series` if
       evolving, `gauge` if comparing to a known max, `stat` for spot value.
     - **histogram bucket**: `heatmap` for distribution, `time_series` of
       `histogram_quantile()` for percentiles.
     - **summary**: `time_series` (already pre-aggregated quantiles).
  3. **Anti-patterns** (explicit "do not"):
     - Don't use `stat` for a time-evolving counter — use `time_series`.
     - Don't use `bar` for time-evolving data — bars are for instant top-N.
     - Don't use `heatmap` without `rate()` and `sum by (le)`.
     - Don't put more than ~30 series in a single `time_series` — split or
       use `topk(N, ...)`.
- **Acceptance:** a held-out eval prompt ("create a panel for HTTP request
  rate on `/api/v1/query`") generates a `time_series` with `rate(...[5m])`,
  not a raw `stat` with the cumulative counter value.

### T-211 · Agent: post-query data inspection before viz choice

- **Files:** new tool action + [orchestrator-action-handlers.ts](packages/agent-core/src/agent/orchestrator-action-handlers.ts)
  + prompt update
- **Idea:** before emitting a panel, the agent runs `prometheus.query` (or
  validate) and gets back metadata: series count, value range, sample density,
  bucket count if histogram. Use these to refine the viz choice. E.g.:
  - 1 series, scalar → `stat`
  - 1 series with high variance → `time_series`
  - many series with `le` → `heatmap`
  - many flat series → `time_series` with `legendStats: ['mean']`
- **Implementation sketch:** add a "shape report" to the existing query tool
  result, so when the agent calls `prometheus.range_query`, the response
  includes `{ seriesCount, rangeMin, rangeMax, sampleCount, hasLeLabel }`.
  Prompt teaches it to read these before `dashboard.add_panels`.
- **Acceptance:** agent emits a different viz for `up{job="x"}` (1 series →
  `stat`) vs `up` (50 series → `bar` of by-job sum or `time_series`).

### T-212 · Agent: panel grouping by intent (sections)

- **Existing:** `panel.sectionLabel` already exists but the agent rarely sets
  it.
- **Change:** prompt teaches the agent to emit sections matching a USE
  pattern (Utilization / Saturation / Errors) for resources, or RED
  (Rate / Errors / Duration) for services. Each section gets a stat row
  on top + 2-3 detail panels below.
- **Acceptance:** "monitor my HTTP API" generates 3 sections (Rate, Errors,
  Duration), each with a stat header + supporting detail panel.

---

## Workstream C — New viz types

### T-220 · Bar gauge (new type `bar_gauge`)

- **Why:** missing first-class viz for SLO comparisons, capacity bars, vote
  counts, anything where N items each compare against a known max in a
  compact horizontal bar.
- **Files:**
  - new `packages/web/src/components/viz/BarGaugeViz.tsx`
  - register in [DashboardPanelCard.tsx](packages/web/src/components/DashboardPanelCard.tsx)
  - add to `PanelVisualization` union in
    [common/dashboard.ts](packages/common/src/models/dashboard.ts) and
    [web/panel/types.ts](packages/web/src/components/panel/types.ts)
- **Render:** N rows, each a horizontal bar from 0 to `max` with the value
  filled to its proportion, threshold-colored. Two display modes:
  `'gradient'` (single bar with color gradient) and `'lcd'` (segmented like
  Grafana's LCD mode). Default `'gradient'`.
- **Schema:** `panel.barGaugeMax?: number` (single max for all rows) and
  `panel.barGaugeMode?: 'gradient' | 'lcd'`.
- **Agent prompt:** "Use `bar_gauge` when comparing N items against a known
  ceiling — SLO percentages, cluster capacity %, request quota %." Don't
  use it for absolute counts (use `bar`).

### T-221 · Annotations on time-series

- **Why:** showing deploy/incident/alert events as vertical lines on the
  chart turns a generic latency panel into a forensics tool.
- **Files:** schema + [TimeSeriesViz.tsx](packages/web/src/components/viz/TimeSeriesViz.tsx)
  + [HeatmapViz.tsx](packages/web/src/components/viz/HeatmapViz.tsx)
- **Schema:** `panel.annotations?: Array<{ time: number; label: string;
  color?: string }>`. (Could also be a separate top-level
  `dashboard.annotations` later — defer.)
- **Render:** each annotation = a vertical dashed line at its `time` (use
  `valToPos`); tiny color-tagged flag at the top with the label on hover.
- **Agent integration:** later (separate task) — agent can populate
  annotations from alert-firing history or deploy logs. For now, just wire
  the schema and rendering.

---

## Suggested execution order (single engineer, ~1 week)

1. **Day 1:** T-201 (legend), T-204 (heatmap empty rows), T-206 (bar top-N) —
   independent file edits, parallelizable.
2. **Day 2:** T-202 (markers), T-203 (log scale), T-205 (stat 100% color),
   T-207 (pie other).
3. **Day 3:** T-210 (prompt decision tree) + initial dogfooding on a real
   dashboard prompt.
4. **Day 4:** T-220 (bar gauge) — new viz type, schema + render.
5. **Day 5:** T-211 (post-query shape inspection) + T-212 (grouping by intent).
6. **Day 6:** T-221 (annotations) + verification across all panel types.
7. **Day 7:** End-to-end eval — generate 5 different dashboard prompts, score
   on viz appropriateness vs hand-picked baseline.

## Out of scope (explicit)

- New plugin-style viz extensibility — premature.
- Server-side viz pre-rendering — not needed at our scale.
- Per-series field overrides (Grafana's "field overrides") — the legend stats
  + thresholds we already have cover the 80% case.
- Annotation auto-population from alert/deploy history — separate effort.
