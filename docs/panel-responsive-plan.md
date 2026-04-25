# Responsive panel rendering — plan (2026-04-24)

## Context

Current `DashboardPanelCard` + `DashboardGrid` render every viz at a single fixed
height (`defaultH = 3` rows ≈ 300px). Stat and gauge panels end up with huge
empty space around a small number / small arc, while `time_series` / `heatmap`
look fine. User flagged this after a live smoke of the agent-generated Caddy
dashboard — "panel 尺寸感觉不对,需要响应式自适应"。

Grafana solves this with a **container-first + aspect-ratio-aware** strategy: no
CSS media queries inside vizzes; each viz receives explicit pixel `(w, h)` from
the grid and chooses its internal layout programmatically. Full Grafana audit
in chat history, core mechanisms:

| # | Mechanism | Grafana source |
|---|---|---|
| 1 | 24-column grid, 30px row height, 8px row gap | `public/app/core/constants.ts:1-3` |
| 2 | `PanelChrome` render-props → viz receives `(innerWidth, innerHeight)` | `packages/grafana-ui/src/components/PanelChrome/PanelChrome.tsx:190-461` |
| 3 | BigValue aspect-ratio switch — `w/h > 2.5` → side-by-side, else stacked | `packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx:532-550` |
| 4 | Content-aware font sizing via canvas `measureText` | `packages/grafana-ui/src/utils/measureText.ts:48-65` |
| 5 | Sparkline visibility tied to height thresholds (50 / 100 px) | `BigValueLayout.tsx:537,545` |
| 6 | Legend placement by viewport breakpoint (bottom on narrow, right on wide) | `VizLayout.tsx:58-59` |
| 7 | `ResizeObserver` on grid root drives responsive recalc | `public/app/features/dashboard/dashgrid/DashboardGrid.tsx:292-310` |
| 8 | Mobile single-column fallback at `< md` | `DashboardGrid.tsx:195` |
| 9 | `useMeasure` for dynamic subcomponents (legend, subheaders) | `packages/grafana-ui/src/components/VizLayout/VizLayout.tsx:44,71-94` |
| 10 | SVG gauges scale via `width`/`height` props, never fixed px | `RadialGauge.tsx:138-148` |

## Current state inventory

**openobs — what exists today:**

- [packages/web/src/components/DashboardGrid.tsx:46-73](../packages/web/src/components/DashboardGrid.tsx#L46-L73) — `compactLayout()` — 12-col `react-grid-layout`, uniform `defaultH = 3` for every viz type
- [packages/web/src/components/DashboardPanelCard.tsx](../packages/web/src/components/DashboardPanelCard.tsx) — panel chrome; renders header + viz directly without measuring the container or passing dimensions down
- [packages/web/src/components/TimeSeriesViz.tsx](../packages/web/src/components/TimeSeriesViz.tsx) — time-series renderer (likely fine; most visible issues are on stat/gauge)
- Stat / gauge / bar_gauge renderers — inside `DashboardPanelCard` or sibling components; use CSS to fill, not JS to compute

**openobs — what doesn't exist:**

- No `useMeasure` / `ResizeObserver` anywhere in the panel code path
- No aspect-ratio-driven layout switch
- No font auto-sizing — stat numbers are a fixed Tailwind class like `text-5xl`
- No sparkline hide/show rule by height
- 12-col grid (Grafana uses 24 for finer granularity; not critical)
- No mobile breakpoint fallback

## Plan — three stages

Each stage is a standalone PR; merge boundaries are deliberate so regressions
are easy to bisect. Ship in order; don't skip.

### Stage 1 — defaultH per viz + stat font auto-size (small, high visible payoff)

**Scope: ~100-line diff; self-contained.**

#### T1.1 — per-type `defaultH` in grid layout
- File: [packages/web/src/components/DashboardGrid.tsx:54](../packages/web/src/components/DashboardGrid.tsx#L54)
- Change `const defaultH = isStat ? 3 : isGauge ? 3 : 3` → `isStat ? 2 : isGauge ? 3 : 3`
- Change `minH: isStat ? 3 : isGauge ? 2 : 3` → `isStat ? 2 : isGauge ? 2 : 3`
- Result: new stat panels get 200px instead of 300px. Old persisted dashboards keep their stored height; not a migration.

#### T1.2 — bar_gauge default height
- Same file; bar_gauge currently falls into the `else` branch (3 rows). At short bar counts it also reads empty. Make it opt into `h = 2` when panel has ≤ 6 bars (need to inspect panel.queries to see bar count — maybe defer and keep 3).
- Decision at implementation time: if detecting bar count is messy, skip this in Stage 1.

#### T1.3 — stat number font auto-size
- Port Grafana's `calculateFontSize()` as a small utility: `packages/web/src/utils/measureText.ts` (new file)
- `calculateFontSize(text, maxWidth, maxHeight, lineHeight, fontWeight)` → number (px)
- Implementation mirrors Grafana's [measureText.ts:48-65](../../grafana/packages/grafana-ui/src/utils/measureText.ts#L48-L65):
  1. Create a hidden canvas once (module-level), cache `canvas.measureText` results in a Map
  2. Measure text at baseline 14px
  3. `fontSizeBasedOnWidth = (maxWidth / textWidth) * 14`
  4. `fontSizeBasedOnHeight = maxHeight / lineHeight`
  5. Return `Math.min(fontSizeBasedOnWidth, fontSizeBasedOnHeight, MAX_CAP)`
- Wire into the stat value render inside `DashboardPanelCard` (or wherever the big number is). Replace the fixed Tailwind class with a `style={{ fontSize: computedPx }}`
- Unit test the utility: a 50-char string in 100×30 → small px; a 3-char string in 200×100 → big px.

#### T1.4 — smoke test
- Open the Caddy dashboard created during the 2026-04-23 smoke (3 stat + 1 gauge + time_series + heatmap mix) and visually confirm:
  - stat numbers fill the panel more fully
  - gauge arcs still render cleanly
  - time_series unchanged

**Stage 1 deliverable: one PR titled "Responsive panels stage 1: per-viz defaultH + stat font auto-size". Should eliminate ~80% of the visible "panels feel empty" complaint.**

### Stage 2 — measured panel, aspect-ratio layout switch (bigger, deeper)

**Scope: ~300-line diff; touches DashboardPanelCard + stat viz. Independent PR.**

#### T2.1 — `useMeasure` on panel content area
- File: [packages/web/src/components/DashboardPanelCard.tsx](../packages/web/src/components/DashboardPanelCard.tsx)
- Import `useMeasure` from `react-use` (already a dep? check — if not, write a 15-line hook ourselves using `ResizeObserver`)
- Wrap the content area (below the header) in a measured div, expose `{ width, height }`
- Pass these down to viz renderers via props or context

#### T2.2 — Viz renderer render-props pattern
- Change every viz invocation to take `(innerWidth, innerHeight)` as props
- Vizzes that don't need them (bar, pie) pass through as CSS fill, unchanged
- Vizzes that DO care (stat, gauge) become aware of their box

#### T2.3 — Stat layout switch on aspect ratio
- Current stat: number on top, sparkline below (stacked)
- Port Grafana's rule: if `w / h > 2.5` → side-by-side (number left, sparkline right); else stacked
- Sparkline also switches: show if h > 50px (wide) or h > 100px (stacked); else number only
- Files to touch: the stat renderer inside `DashboardPanelCard` (or split into `StatViz.tsx` at this point)

#### T2.4 — Gauge: hide needle text below threshold
- Port `textMode: 'auto'` — below 120×120 px, show only the gauge arc + value; above, show label too
- File: gauge renderer

#### T2.5 — Unit + visual tests
- Snapshot test a stat panel at 400×150 (wide) vs 200×300 (narrow) and assert layout differs
- Snapshot or manual: gauge at 80×80 vs 400×400

**Stage 2 deliverable: one PR "Responsive panels stage 2: measured panels + aspect-ratio stat layout".**

### Stage 3 — Grid upgrade + mobile fallback (optional polish)

**Scope: behavior change on the grid itself. Own PR, may need migration note.**

#### T3.1 — 12 → 24 column grid
- Finer-grained widths (e.g. a stat can be 4/24 = 1/6 instead of 2/12 = 1/6 + forced)
- Migrate existing stored panel widths: multiply by 2 once on read
- File: `DashboardGrid.tsx`, `GRID_COLUMN_COUNT` constant, and wherever stored widths are deserialized

#### T3.2 — Mobile single-column
- `useResizeObserver` on grid root (Grafana pattern)
- If `gridWidth < 768` (Tailwind `md`), force every panel to `w = 24` and stack vertically (disable drag/resize)
- Preserve original `gridPos` so desktop resize restores layout
- File: `DashboardGrid.tsx`

#### T3.3 — Legend placement switch (time_series)
- When container `height < 200px`, move legend to bottom regardless of user preference; when `height >= 200px`, honor the configured placement
- File: `TimeSeriesViz.tsx`

**Stage 3 deliverable: PR "Responsive panels stage 3: 24-col grid + mobile fallback".**

## Task breakdown (ready to implement)

| Task | Stage | Est. | Touches | Blocker |
|---|---|---|---|---|
| T1.1 per-type defaultH | 1 | 15 min | `DashboardGrid.tsx` | — |
| T1.2 bar_gauge height (skip if messy) | 1 | 20 min | `DashboardGrid.tsx` | — |
| T1.3 calculateFontSize util + wire | 1 | 1 h | new `utils/measureText.ts`, `DashboardPanelCard.tsx` | — |
| T1.4 visual smoke | 1 | 15 min | — | live dashboards needed |
| T2.1 useMeasure hook | 2 | 30 min | `DashboardPanelCard.tsx` | — |
| T2.2 render-props plumbing | 2 | 1 h | all viz renderers | T2.1 |
| T2.3 stat aspect layout switch | 2 | 1 h | stat renderer | T2.2 |
| T2.4 gauge text auto | 2 | 30 min | gauge renderer | T2.2 |
| T2.5 tests | 2 | 45 min | new test files | T2.3, T2.4 |
| T3.1 24-col grid + migration | 3 | 1.5 h | grid + serialization | — |
| T3.2 mobile fallback | 3 | 1 h | `DashboardGrid.tsx` | — |
| T3.3 legend placement switch | 3 | 30 min | `TimeSeriesViz.tsx` | — |

Rough totals: **Stage 1 ≈ 2 h**, **Stage 2 ≈ 4 h**, **Stage 3 ≈ 3 h**. Ship Stage 1 first.

## Out of scope (don't do in these PRs)

- **Native crash bug** (Windows `0xC0000409` at ~27-step agent runs) — track separately; unrelated to panel rendering
- **agent-side dashboard panel choice** — Stage 1-3 only fix how existing panels render; the agent's prompt decides what panels to create, which is already tuned
- **Panel config UI** (edit panel → choose viz) — no user-facing control changes
- **Dark / light theme tuning** — out of scope; assume dark-only like today

## Reference files to read before starting

On the Grafana side:
- [packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx](../../grafana/packages/grafana-ui/src/components/BigValue/BigValueLayout.tsx) — the model for Stage 2 stat behavior
- [packages/grafana-ui/src/utils/measureText.ts](../../grafana/packages/grafana-ui/src/utils/measureText.ts) — the exact recipe for T1.3
- [packages/grafana-ui/src/components/PanelChrome/PanelChrome.tsx](../../grafana/packages/grafana-ui/src/components/PanelChrome/PanelChrome.tsx) — render-props pattern for T2.1–T2.2

On the openobs side:
- [packages/web/src/components/DashboardGrid.tsx](../packages/web/src/components/DashboardGrid.tsx) — grid layout logic
- [packages/web/src/components/DashboardPanelCard.tsx](../packages/web/src/components/DashboardPanelCard.tsx) — panel chrome + viz dispatch
- [packages/web/src/components/TimeSeriesViz.tsx](../packages/web/src/components/TimeSeriesViz.tsx) — existing time-series renderer (Stage 3)

## Decision points for day-of

1. **Does `react-use` already ship with the web package?** If yes, use `useMeasure` from it; if no, write a 15-line `ResizeObserver` hook ourselves (cheaper than adding a dep).
2. **Stat renderer location** — is it inline in `DashboardPanelCard` or split into `StatViz.tsx`? If split, T2.3 is cleaner; if inline, split it out as part of T2.3.
3. **Canvas warmup** — the `measureText` utility needs a canvas instance. Create it lazily on first call (Grafana pattern) rather than at module load, to keep SSR-safe if the repo ever moves that way.
4. **Snapshot-testing infra** — `packages/web` uses vitest. Does it have a DOM snapshot setup? If not, skip snapshot tests in Stage 2 and do manual visual checks instead.
