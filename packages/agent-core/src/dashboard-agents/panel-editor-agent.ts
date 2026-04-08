import { createLogger } from '@agentic-obs/common'
import type {
  Dashboard,
  DashboardAction,
  DashboardVariable,
  PanelConfig,
} from '@agentic-obs/common'
import type { LLMGateway } from '@agentic-obs/llm-gateway'
import { parseLlmJson } from './llm-json.js'
import { agentRegistry } from '../runtime/agent-registry.js'
import type { PanelAdderAgent } from './panel-adder-agent.js'
import { normalizePanelPatch } from './panel-normalization.js'

const log = createLogger('panel-editor')

type EditableActionType = 'modify_panel' | 'remove_panels' | 'rearrange'

export interface PanelEditorDeps {
  gateway: LLMGateway
  model: string
  panelAdderAgent: PanelAdderAgent
}

export interface PanelEditorInput {
  userRequest: string
  requestedAction: EditableActionType
  requestedArgs: Record<string, unknown>
  dashboard: Dashboard
}

export interface PanelEditorOutput {
  summary: string
  actions: DashboardAction[]
}

interface RawEditPlan {
  summary?: string
  actions?: unknown[]
}

interface GeneratedPanelsResult {
  panels: PanelConfig[]
  variables: DashboardVariable[]
}

export class PanelEditorAgent {
  static readonly definition = agentRegistry.get('dashboard-editor')!

  constructor(private deps: PanelEditorDeps) {}

  async planEdit(input: PanelEditorInput): Promise<PanelEditorOutput> {
    switch (input.requestedAction) {
      case 'remove_panels':
        return this.buildRemovePlan(input)
      case 'rearrange':
        return this.buildRearrangePlan(input)
      case 'modify_panel':
        return this.buildModifyPlan(input)
    }
  }

  private buildRemovePlan(input: PanelEditorInput): PanelEditorOutput {
    const panelIds = Array.isArray(input.requestedArgs.panelIds)
      ? input.requestedArgs.panelIds.filter((value): value is string => typeof value === 'string')
      : []
    const validIds = panelIds.filter((id) => input.dashboard.panels.some((panel) => panel.id === id))
    return {
      summary: validIds.length > 0
        ? `Removed ${validIds.length} panel(s).`
        : 'No matching panels were found to remove.',
      actions: validIds.length > 0 ? [{ type: 'remove_panels', panelIds: validIds }] : [],
    }
  }

  private buildRearrangePlan(input: PanelEditorInput): PanelEditorOutput {
    const layout = Array.isArray(input.requestedArgs.layout)
      ? input.requestedArgs.layout
        .map((item) => {
          const raw = (item ?? {}) as Record<string, unknown>
          if (typeof raw.panelId !== 'string') return null
          const existingPanel = input.dashboard.panels.find((panel) => panel.id === raw.panelId)
          if (!existingPanel) return null
          return {
            panelId: raw.panelId,
            row: Number.isFinite(Number(raw.row)) ? Number(raw.row) : existingPanel.row,
            col: Number.isFinite(Number(raw.col)) ? Number(raw.col) : existingPanel.col,
            width: existingPanel.width,
            height: existingPanel.height,
          }
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
      : []

    return {
      summary: layout.length > 0
        ? `Rearranged ${layout.length} panel(s).`
        : 'No matching panels were found to rearrange.',
      actions: layout.length > 0 ? [{ type: 'rearrange', layout }] : [],
    }
  }

  private async buildModifyPlan(input: PanelEditorInput): Promise<PanelEditorOutput> {
    const panelId = typeof input.requestedArgs.panelId === 'string' ? input.requestedArgs.panelId : ''
    const existingPanel = input.dashboard.panels.find((panel) => panel.id === panelId)
    const rawPatch = (input.requestedArgs.patch ?? {}) as Partial<PanelConfig>
    const fallbackPatch = normalizePanelPatch(existingPanel, rawPatch)

    if (!existingPanel) {
      return {
        summary: 'The panel to edit was not found.',
        actions: [],
      }
    }

    const fallbackPlan: PanelEditorOutput = {
      summary: `Updated "${existingPanel.title}".`,
      actions: [{ type: 'modify_panel', panelId, patch: fallbackPatch }],
    }

    const llmPlan = await this.generateEditPlan(input, existingPanel)
    if (!llmPlan?.actions?.length) return fallbackPlan

    const actions = await this.normalizePlannedActions(llmPlan.actions, input.dashboard)
    if (actions.length === 0) return fallbackPlan

    return {
      summary: typeof llmPlan.summary === 'string' && llmPlan.summary.trim()
        ? llmPlan.summary.trim()
        : this.describePlan(actions, input.dashboard),
      actions: this.orderActions(actions),
    }
  }

  private async generateEditPlan(
    input: PanelEditorInput,
    existingPanel: PanelConfig,
  ): Promise<RawEditPlan | null> {
    const panelSummaries = input.dashboard.panels.map((panel) => ({
      id: panel.id,
      title: panel.title,
      visualization: panel.visualization,
      queryCount: panel.queries?.length ?? (panel.query ? 1 : 0),
      sectionLabel: panel.sectionLabel,
    }))

    const systemPrompt = `You are a dashboard panel editor. Plan the minimal set of dashboard actions needed to satisfy the user's request against an existing dashboard.

Rules:
- You may use ONLY these action types: modify_panel, remove_panels, rearrange, generate_panels.
- Prefer preserving an existing panel and removing redundant ones after the surviving panel has been updated.
- Keep every user-requested signal visible after the edit. If a single-value visualization would hide multiple important values, do not plan that merge.
- Never invent panel IDs. Use only IDs from the provided dashboard context.
- For modify_panel patches, use "queries" when changing PromQL. Every query must include both "refId" and "expr".
- Use generate_panels when the right edit result requires replacing one panel with one or more newly generated panels instead of patching the old panel directly.
- Keep the plan minimal. If one modify_panel action is enough, return one action.

Return JSON only:
{
  "summary": "short human summary",
  "actions": [
    { "type": "modify_panel", "panelId": "panel_1", "patch": { "title": "...", "queries": [{ "refId": "A", "expr": "..." }] } },
    { "type": "generate_panels", "goal": "replace the old single-value panel with two time series panels for p95 and p99 latency" },
    { "type": "remove_panels", "panelIds": ["panel_2"] }
  ]
}`

    const userPrompt = JSON.stringify({
      userRequest: input.userRequest,
      requestedAction: input.requestedAction,
      requestedArgs: input.requestedArgs,
      focusedPanel: {
        id: existingPanel.id,
        title: existingPanel.title,
        description: existingPanel.description,
        visualization: existingPanel.visualization,
        query: existingPanel.query,
        queries: existingPanel.queries ?? [],
      },
      dashboardPanels: panelSummaries,
    }, null, 2)

    try {
      const resp = await this.deps.gateway.complete([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ], {
        model: this.deps.model,
        maxTokens: 1200,
        temperature: 0.1,
        responseFormat: 'json',
      })

      const parsed = parseLlmJson<RawEditPlan>(resp.content)
      return parsed ?? null
    }
    catch (error) {
      log.warn({ error }, 'panel edit planning failed, using fallback patch')
      return null
    }
  }

  private async normalizePlannedActions(rawActions: unknown[], dashboard: Dashboard): Promise<DashboardAction[]> {
    const actions: DashboardAction[] = []

    for (const item of rawActions) {
      const raw = (item ?? {}) as Record<string, unknown>
      if (raw.type === 'modify_panel' && typeof raw.panelId === 'string') {
        const existingPanel = dashboard.panels.find((panel) => panel.id === raw.panelId)
        if (!existingPanel) continue
        const patch = normalizePanelPatch(existingPanel, (raw.patch ?? {}) as Partial<PanelConfig>)
        actions.push({ type: 'modify_panel', panelId: raw.panelId, patch })
        continue
      }

      if (raw.type === 'remove_panels' && Array.isArray(raw.panelIds)) {
        const panelIds = raw.panelIds.filter((value): value is string => typeof value === 'string')
          .filter((id) => dashboard.panels.some((panel) => panel.id === id))
        if (panelIds.length > 0) actions.push({ type: 'remove_panels', panelIds: Array.from(new Set(panelIds)) })
        continue
      }

      if (raw.type === 'rearrange' && Array.isArray(raw.layout)) {
        const layout = raw.layout
          .map((entry) => {
            const value = (entry ?? {}) as Record<string, unknown>
            if (typeof value.panelId !== 'string') return null
            if (!dashboard.panels.some((panel) => panel.id === value.panelId)) return null
            return {
              panelId: value.panelId,
              row: Number(value.row ?? 0),
              col: Number(value.col ?? 0),
              width: Number(value.width ?? 0),
              height: Number(value.height ?? 0),
            }
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        if (layout.length > 0) actions.push({ type: 'rearrange', layout })
        continue
      }

      if (raw.type === 'generate_panels' && typeof raw.goal === 'string' && raw.goal.trim()) {
        const generated = await this.generateReplacementPanels(raw.goal.trim(), dashboard)
        if (generated.panels.length > 0) {
          actions.push({ type: 'add_panels', panels: generated.panels })
          for (const variable of generated.variables) {
            actions.push({ type: 'add_variable', variable })
          }
        }
      }
    }

    return actions
  }

  private async generateReplacementPanels(goal: string, dashboard: Dashboard): Promise<GeneratedPanelsResult> {
    const gridNextRow = dashboard.panels.length > 0
      ? Math.max(...dashboard.panels.map((panel) => panel.row + panel.height))
      : 0

    try {
      const result = await this.deps.panelAdderAgent.addPanels({
        goal,
        existingPanels: dashboard.panels,
        existingVariables: dashboard.variables,
        availableMetrics: [],
        labelsByMetric: {},
        gridNextRow,
      })
      return {
        panels: result.panels,
        variables: result.variables ?? [],
      }
    }
    catch (error) {
      log.warn({ error, goal }, 'replacement panel generation failed')
      return { panels: [], variables: [] }
    }
  }

  private describePlan(actions: DashboardAction[], dashboard: Dashboard): string {
    if (actions.length === 1) {
      const action = actions[0]
      if (!action) return 'Updated the dashboard panels.'
      if (action.type === 'add_panels') {
        return `Added ${action.panels.length} panel(s).`
      }
      if (action.type === 'add_variable') {
        return `Added variable "${action.variable.name}".`
      }
      if (action.type === 'modify_panel') {
        const panel = dashboard.panels.find((item) => item.id === action.panelId)
        return `Updated "${panel?.title ?? action.panelId}".`
      }
      if (action.type === 'remove_panels') {
        return `Removed ${action.panelIds.length} panel(s).`
      }
      if (action.type === 'rearrange') {
        return `Rearranged ${action.layout.length} panel(s).`
      }
    }

    const addedPanels = actions
      .filter((action): action is Extract<DashboardAction, { type: 'add_panels' }> => action.type === 'add_panels')
      .reduce((total, action) => total + action.panels.length, 0)
    const removedPanels = actions
      .filter((action): action is Extract<DashboardAction, { type: 'remove_panels' }> => action.type === 'remove_panels')
      .reduce((total, action) => total + action.panelIds.length, 0)
    const modifiedPanels = actions
      .filter((action): action is Extract<DashboardAction, { type: 'modify_panel' }> => action.type === 'modify_panel')
      .length
    const addedVariables = actions
      .filter((action): action is Extract<DashboardAction, { type: 'add_variable' }> => action.type === 'add_variable')
      .length

    const parts: string[] = []
    if (modifiedPanels > 0) parts.push(`updated ${modifiedPanels} panel(s)`)
    if (addedPanels > 0) parts.push(`added ${addedPanels} panel(s)`)
    if (removedPanels > 0) parts.push(`removed ${removedPanels} panel(s)`)
    if (addedVariables > 0) parts.push(`added ${addedVariables} variable(s)`)

    return parts.length > 0
      ? `Completed the panel edit: ${parts.join(', ')}.`
      : 'Completed the panel edit.'
  }

  private orderActions(actions: DashboardAction[]): DashboardAction[] {
    const priority: Record<DashboardAction['type'], number> = {
      add_panels: 1,
      modify_panel: 2,
      remove_panels: 3,
      rearrange: 4,
      add_variable: 5,
      set_title: 6,
      create_alert_rule: 7,
      modify_alert_rule: 8,
      delete_alert_rule: 9,
    }

    return [...actions].sort((left, right) => priority[left.type] - priority[right.type])
  }
}
