import { randomUUID } from 'node:crypto'
import type {
  PanelConfig,
  PanelQuery,
  PanelVisualization,
} from '@agentic-obs/common'
import type { RawPanelSpec } from './types.js'
import { panelSize } from './layout-engine.js'

// Keep in sync with `PanelVisualization` in @agentic-obs/common.
const VALID_VISUALIZATIONS = new Set<string>([
  'time_series', 'stat', 'table', 'gauge', 'bar', 'bar_gauge',
  'heatmap', 'pie', 'histogram', 'status_timeline',
])

export function toPanelConfigs(rawPanels: RawPanelSpec[], startRow = 0): PanelConfig[] {
  return rawPanels.map((raw) => {
    const visualization: PanelVisualization = VALID_VISUALIZATIONS.has(raw.visualization)
      ? raw.visualization as PanelVisualization
      : 'time_series'

    const queries: PanelQuery[] = (raw.queries ?? []).map((query) => ({
      refId: query.refId,
      expr: query.expr,
      legendFormat: query.legendFormat,
      instant: query.instant,
    }))

    // Panel size is viz-derived, not agent-driven — keeps proportions
    // consistent across all generated dashboards; user resizes post-gen.
    const dims = panelSize(visualization)

    return {
      id: randomUUID(),
      title: raw.title ?? 'Panel',
      description: raw.description ?? '',
      queries,
      visualization,
      row: Math.max(0, (raw.row ?? 0) + startRow),
      col: Math.min(11, Math.max(0, raw.col ?? 0)),
      width: dims.width,
      height: dims.height,
      refreshIntervalSec: 30,
      unit: raw.unit,
      stackMode: raw.stackMode,
      fillOpacity: raw.fillOpacity,
      decimals: raw.decimals,
      thresholds: raw.thresholds,
    } as PanelConfig
  })
}

export function normalizePanelPatch(
  existingPanel: PanelConfig | undefined,
  patch: Partial<PanelConfig>,
): Partial<PanelConfig> {
  const normalized = { ...patch }

  if ('queries' in normalized) {
    const rawQueries = Array.isArray(normalized.queries) ? normalized.queries : []
    const fallbackQueries = existingPanel?.queries ?? (existingPanel?.query
      ? [{ refId: 'A', expr: existingPanel.query, instant: existingPanel.visualization !== 'time_series' }]
      : [])

    const queries = rawQueries
      .map((query, index) => {
        const value = ((query ?? {}) as unknown) as Record<string, unknown>
        const expr = typeof value.expr === 'string'
          ? value.expr.trim()
          : typeof value.query === 'string'
            ? value.query.trim()
            : typeof value.promql === 'string'
              ? value.promql.trim()
              : ''
        if (!expr) return null

        const fallbackRefId = fallbackQueries[index]?.refId ?? String.fromCharCode(65 + index)
        return {
          refId: typeof value.refId === 'string' && value.refId.trim() ? value.refId.trim() : fallbackRefId,
          expr,
          ...(typeof value.legendFormat === 'string' ? { legendFormat: value.legendFormat } : {}),
          ...(typeof value.instant === 'boolean' ? { instant: value.instant } : {}),
          ...(typeof value.datasourceId === 'string' ? { datasourceId: value.datasourceId } : {}),
        }
      })
      .filter((query): query is NonNullable<typeof query> => query !== null)

    normalized.queries = queries
    normalized.query = queries[0]?.expr ?? existingPanel?.query
  }

  return normalized
}
