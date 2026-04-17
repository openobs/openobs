import type { PanelConfig, PanelVisualization } from '@agentic-obs/common'

const GRID_COLS = 12

interface PanelSize {
  width: number
  height: number
}

/**
 * Determine the default size for a panel based on its visualization type
 * and the composition of its section.
 */
export function panelSize(viz: PanelVisualization, sameVizCount: number = 1): PanelSize {
  switch (viz) {
    case 'stat':
      // 3×3 reads as a square tile (big number on top, sparkline strip on
      // bottom). Landscape (height: 2) squashes the sparkline and makes the
      // panel feel unfinished next to time_series neighbors.
      return { width: 3, height: 3 }
    case 'gauge':
      // SVG arc needs vertical room — gauge visualization is ~150px tall
      return { width: 3, height: 3 }
    case 'time_series':
      // Always half-width. A single time_series at full width (12) beside a
      // half-width heatmap looked inconsistent — row heights differ and the
      // layout reads as accidental. 6×3 keeps all "detail charts" in one
      // column rhythm, even if a lone panel leaves the right half empty.
      return { width: 6, height: 3 }
    case 'table':
      return { width: sameVizCount >= 2 ? 6 : 12, height: 4 }
    case 'bar':
    case 'histogram':
      // 3+ → fit 3 per row; 2 → half width; 1 → half width
      return { width: sameVizCount >= 3 ? 4 : 6, height: 3 }
    case 'pie':
      // Pie/donut is inherently circular — a 6×3 (2:1) panel forces the
      // circle into one third of the width with a lot of empty space.
      // 3×3 matches stat's square tile and keeps the chart centred and
      // legible regardless of sibling count.
      return { width: 3, height: 3 }
    case 'heatmap':
      // 6×3 matches time_series / bar / pie so side-by-side rows don't leave
      // a visible height step; full-width (12) reads as a flat strip.
      return { width: 6, height: 3 }
    case 'status_timeline':
      return { width: 12, height: 3 }
    default:
      return { width: 6, height: 3 }
  }
}

/**
 * Compute deterministic row/col/width/height for all panels.
 *
 * Panels are grouped by sectionId. Within each section, panels are placed
 * left-to-right in a 12-column grid, wrapping to the next row when full.
 * Sections stack top-to-bottom in the order they appear.
 *
 * Panel width adapts based on how many panels of the same visualization
 * type exist in the section — e.g., 2 time_series panels get 6 cols each
 * (side by side), a single time_series gets 12 cols (full width).
 */
export function applyLayout(panels: PanelConfig[]): PanelConfig[] {
  // Group panels by section, preserving order of first appearance
  const sectionOrder: string[] = []
  const sections = new Map<string, PanelConfig[]>()

  for (const panel of panels) {
    const key = panel.sectionId ?? '__default__'
    if (!sections.has(key)) {
      sectionOrder.push(key)
      sections.set(key, [])
    }
    sections.get(key)!.push(panel)
  }

  const result: PanelConfig[] = []
  let currentRow = 0

  for (const sectionId of sectionOrder) {
    const sectionPanels = sections.get(sectionId)!

    // Count panels by visualization type in this section
    const vizCounts = new Map<string, number>()
    for (const p of sectionPanels) {
      vizCounts.set(p.visualization, (vizCounts.get(p.visualization) ?? 0) + 1)
    }

    let col = 0
    let rowHeight = 0

    for (const panel of sectionPanels) {
      const sameVizCount = vizCounts.get(panel.visualization) ?? 1
      const size = panelSize(panel.visualization, sameVizCount)

      // Wrap to next row if this panel doesn't fit
      if (col + size.width > GRID_COLS) {
        currentRow += rowHeight
        col = 0
        rowHeight = 0
      }

      result.push({
        ...panel,
        col,
        row: currentRow,
        width: size.width,
        height: size.height,
      })

      col += size.width
      rowHeight = Math.max(rowHeight, size.height)
    }

    // Advance past the last row of this section
    currentRow += rowHeight
  }

  return result
}
