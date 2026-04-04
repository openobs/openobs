import { parseLlmJson } from '../llm-json.js'
import { createLogger } from '@agentic-obs/common'
import type { ResearchResult } from '../research-agent.js'
import { GENERATION_PRINCIPLES, buildGroundingContext } from '../system-context.js'

const log = createLogger('discovery-phase')
import type { DiscoveryResult } from '../discovery-agent.js'
import type {
  GeneratorDeps,
  GenerateInput,
  DashboardPlan,
} from '../types.js'

export class DiscoveryPhase {
  constructor(private deps: GeneratorDeps) {}

  // Planner: decompose goal into panel groups
  async plan(
    input: GenerateInput,
    research?: ResearchResult,
    discovery?: DiscoveryResult,
  ): Promise<DashboardPlan> {
    const researchContext = research
      ? `\n## Research Context (from web search)\nMonitoring approach: ${research.monitoringApproach}\nKey metrics: ${research.keyMetrics.join(', ')}\nBest practices: ${research.bestPractices.join(', ')}\n`
      : ''

    const metricsContext = discovery
      ? buildGroundingContext({
          discoveredMetrics: discovery.metrics,
          labelsByMetric: discovery.labelsByMetric,
          sampleValues: discovery.sampleValues,
        })
      : ''

    const existingContext = input.existingPanels.length
      ? `\n## Existing Panels (do NOT duplicate)\n${input.existingPanels.map((p) => `- ${p.title}`).join('\n')}\n`
      : ''

    const systemPrompt = `You are a senior SRE planning a monitoring dashboard.
${GENERATION_PRINCIPLES}

## Task
Decompose the monitoring goal into logical panel GROUPS. Each group is a section of the dashboard.
${researchContext}${metricsContext}${existingContext}

## Planning Rules
1. Use your expertise to determine the right monitoring methodology (RED, USE, 4 Golden Signals, or custom) based on the technology.
2. Structure: overview stats first -> core trends -> breakdowns -> detail tables
3. Panel count is determined by what the user asked and what data exists. No fixed targets.
4. Each panel spec needs a queryIntent (natural language description of the query).

## Output Format (JSON)
{
  "title": "Dashboard Title",
  "description": "What this dashboard monitors",
  "groups": [
    {
      "id": "overview",
      "label": "Overview",
      "purpose": "Key health indicators at a glance",
      "panelSpecs": []
    }
  ],
  "variables": [
    { "name": "namespace", "label": "Namespace", "purpose": "Filter by namespace" }
  ]
}`

    // Retry up to 2 times on JSON parse failure
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await this.deps.gateway.complete([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Goal: ${input.goal}\nScope: ${input.scope}` },
        ], {
          model: this.deps.model,
          maxTokens: 8192,
          temperature: 0.1,
          responseFormat: 'json',
        })

        const parsed = parseLlmJson(resp.content) as DashboardPlan

        return {
          title: parsed.title ?? input.goal,
          description: parsed.description ?? '',
          groups: Array.isArray(parsed.groups) ? parsed.groups : [],
          variables: Array.isArray(parsed.variables) ? parsed.variables : [],
        }
      }
      catch (err) {
        log.warn({ err, attempt: attempt + 1 }, 'planner attempt failed')
        if (attempt === 1)
          throw err
        this.deps.sendEvent?.({ type: 'thinking', content: 'Planner returned invalid JSON - retrying...' })
      }
    }

    // Unreachable, but satisfies TypeScript
    throw new Error('Planner failed after retries')
  }
}
