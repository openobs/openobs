import { parseLlmJson } from './llm-json.js'
import { randomUUID } from 'node:crypto'
import type { LLMGateway } from '@agentic-obs/llm-gateway'
import { createLogger } from '@agentic-obs/common'
import { agentRegistry } from '../runtime/agent-registry.js'
import { VerifierAgent } from '../verification/verifier-agent.js'
import type { IMetricsAdapter } from '../adapters/index.js'
import type {
  PanelConfig,
  PanelQuery,
  PanelVisualization,
  DashboardSseEvent,
  InvestigationReport,
  InvestigationReportSection,
} from '@agentic-obs/common'

const log = createLogger('investigation-agent')

// -- Types

export interface InvestigationDeps {
  gateway: LLMGateway
  model: string
  metrics: IMetricsAdapter
  sendEvent: (event: DashboardSseEvent) => void
}

export interface InvestigationInput {
  goal: string
  existingPanels: PanelConfig[]
  availableMetrics?: string[]
  gridNextRow: number
}

export interface InvestigationOutput {
  /** Short 1-2 sentence summary for the chat reply */
  summary: string
  /** Full structured report for the left-side report view */
  report: InvestigationReport
  /** Evidence panels (already included in report sections too) */
  panels: PanelConfig[]
  /** Verification report from the verifier agent */
  verificationReport?: import('../verification/types.js').VerificationReport
}

interface InvestigationPlan {
  hypothesis?: string
  queries: Array<{
    id: string
    description: string
    expr: string
    instant: boolean
  }>
}

interface QueryEvidence {
  id: string
  description: string
  expr: string
  instant: boolean
  result: unknown
  error?: string
}

interface AnalysisSection {
  explanation: string
  panel?: {
    title: string
    description: string
    visualization: string
    queries: Array<{ refId: string, expr: string, legendFormat?: string, instant?: boolean }>
    width: number
    height: number
    unit?: string
    thresholds?: Array<{ value: number, color: string, label?: string }>
  }
}

interface AnalysisResult {
  summary: string
  sections: AnalysisSection[]
}

const VALID_VISUALIZATIONS = new Set<string>([
  'time_series', 'stat', 'table', 'gauge', 'bar',
  'heatmap', 'pie', 'histogram', 'status_timeline',
])

// -- Investigation Sub-Agent

export class InvestigationAgent {
  static readonly definition = agentRegistry.get('investigation-runner')!;

  constructor(private deps: InvestigationDeps) {}

  async investigate(input: InvestigationInput): Promise<InvestigationOutput> {
    const { sendEvent } = this.deps

    // Step 1: Plan investigation queries
    sendEvent({
      type: 'tool_call',
      tool: 'investigate_plan',
      args: { goal: input.goal },
      displayText: `Planning investigation: ${input.goal}`,
    })

    const plan = await this.planInvestigation(input)

    sendEvent({
      type: 'tool_result',
      tool: 'investigate_plan',
      summary: `Hypothesis: ${plan.hypothesis} - ${plan.queries.length} queries planned`,
      success: true,
    })

    // Step 2: Execute queries against Prometheus (parallel)
    sendEvent({
      type: 'tool_call',
      tool: 'investigate_query',
      args: { count: plan.queries.length },
      displayText: `Executing ${plan.queries.length} investigation queries...`,
    })

    const evidence = await this.executeQueries(plan.queries)
    const successCount = evidence.filter((e) => !e.error).length

    sendEvent({
      type: 'tool_result',
      tool: 'investigate_query',
      summary: `${successCount}/${evidence.length} queries returned data`,
      success: successCount > 0,
    })

    // Step 3: Analyze results -> structured report
    sendEvent({
      type: 'tool_call',
      tool: 'investigate_analyze',
      args: { evidenceCount: evidence.length },
      displayText: 'Analyzing evidence and generating report...',
    })

    const analysis = await this.analyzeEvidence(input, plan, evidence)

    sendEvent({
      type: 'tool_result',
      tool: 'investigate_analyze',
      summary: `Report ready - ${analysis.sections.filter((s) => s.panel).length} evidence panels`,
      success: true,
    })

    // Build structured report with panels
    const reportSections: InvestigationReportSection[] = []
    const panels: PanelConfig[] = []
    let currentRow = input.gridNextRow
    let currentCol = 0

    for (const section of analysis.sections) {
      if (section.panel) {
        const panel = this.toPanelConfig(section.panel, currentRow, currentCol)
        panels.push(panel)

        // Auto-layout
        currentCol += panel.width
        if (currentCol >= 12) {
          currentCol = 0
          currentRow += panel.height
        }

        reportSections.push({
          type: 'evidence',
          content: section.explanation,
          panel,
        })
      }
      else {
        reportSections.push({
          type: 'text',
          content: section.explanation,
        })
      }
    }

    const report: InvestigationReport = {
      summary: analysis.summary,
      sections: reportSections,
    }

    // Step 4: Verify the report
    const verifier = new VerifierAgent()
    const verificationReport = await verifier.verify(
      'investigation_report',
      report,
      {
        metricsAdapter: this.deps.metrics,
      },
    )

    log.info(
      { status: verificationReport.status, issues: verificationReport.issues.length },
      'investigation verification complete',
    )

    sendEvent({
      type: 'verification_report',
      report: verificationReport,
    })

    return { summary: analysis.summary, report, panels, verificationReport }
  }

  // Step 0: Discover what metrics actually exist in Prometheus
  private async discoverMetrics(): Promise<string[]> {
    try {
      return await this.deps.metrics.listMetricNames()
    } catch {
      return []
    }
  }

  // Step 1: LLM plans investigation (with real metric discovery)
  private async planInvestigation(input: InvestigationInput): Promise<InvestigationPlan> {
    // Auto-discover available metrics from Prometheus
    const discoveredMetrics = await this.discoverMetrics()
    log.info({ count: discoveredMetrics.length }, 'discovered metrics from Prometheus')

    const existingContext = input.existingPanels.length > 0
      ? `\n## Current dashboard panels\n${input.existingPanels.map((p) => `- ${p.title} (${(p.queries ?? []).map((q) => q.expr).join(' | ')})`).join('\n')}\n`
      : ''

    // Use discovered metrics if available, otherwise fall back to provided list
    const allMetrics = discoveredMetrics.length > 0 ? discoveredMetrics : (input.availableMetrics ?? [])
    const metricsContext = allMetrics.length > 0
      ? `\n## Available Metrics in This Prometheus Instance\nThese are the ACTUAL metrics available. ONLY use metrics from this list in your queries:\n${allMetrics.join('\n')}\n`
      : ''

    const systemPrompt = `You are a senior SRE investigating a production issue. Given the user's question, plan a systematic investigation by deciding what PromQL queries to run.
${existingContext}${metricsContext}
## Rules
1. **ONLY use metrics that exist in the Available Metrics list above** - do NOT guess or invent metric names
2. Based on the user's question, select the most relevant metrics from the list and plan 3-8 targeted PromQL queries to gather evidence
3. Each query should test a specific aspect of the hypothesis
4. Include both instant queries (for current state) and range queries (for trends)

## Output (JSON only, no markdown)
{
  "hypothesis": "Brief initial hypothesis about what might be wrong",
  "queries": [
    {
      "id": "q1",
      "description": "What this query checks",
      "expr": "PromQL expression using ONLY available metrics",
      "instant": false
    }
  ]
}`

    try {
      const resp = await this.deps.gateway.complete([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Investigate: ${input.goal}` },
      ], {
        model: this.deps.model,
        maxTokens: 4096,
        temperature: 0,
        responseFormat: 'json',
      })

      const parsed = parseLlmJson(resp.content) as InvestigationPlan
      const queries = Array.isArray(parsed.queries) ? parsed.queries : []
      log.info({ hypothesis: parsed.hypothesis, queryCount: queries.length }, 'investigation plan ready')
      return {
        hypothesis: parsed.hypothesis ?? 'Unknown',
        queries,
      }
    }
    catch (err) {
      log.error({ err }, 'planInvestigation failed')
      return { hypothesis: 'Failed to plan', queries: [] }
    }
  }

  // Step 2: Execute queries against Prometheus via adapter
  private async executeQueries(
    queries: InvestigationPlan['queries'],
  ): Promise<QueryEvidence[]> {
    return Promise.all(
      queries.map(async (q): Promise<QueryEvidence> => {
        try {
          if (q.instant) {
            const samples = await this.deps.metrics.instantQuery(q.expr)
            return {
              ...q,
              result: {
                resultType: 'vector',
                result: samples.map((s) => ({ metric: s.labels, value: [s.timestamp, String(s.value)] })),
              },
            }
          } else {
            const now = new Date()
            const start = new Date(now.getTime() - 3600_000)
            const ranges = await this.deps.metrics.rangeQuery(q.expr, start, now, '60')
            return {
              ...q,
              result: {
                resultType: 'matrix',
                result: ranges.map((r) => ({ metric: r.metric, values: r.values })),
              },
            }
          }
        }
        catch (err) {
          return { ...q, result: null, error: err instanceof Error ? err.message : 'Query failed' }
        }
      }),
    )
  }

  // Step 3: LLM analyzes evidence + structured report sections
  private async analyzeEvidence(
    input: InvestigationInput,
    plan: InvestigationPlan,
    evidence: QueryEvidence[],
  ): Promise<AnalysisResult> {
    const evidenceSummary = evidence.map((e) => {
      if (e.error) {
        return `- ${e.description}\nQuery: ${e.expr}\nResult: ERROR - ${e.error}`
      }

      const data = e.result as { result?: unknown[]; resultType?: unknown } | null
      const resultCount = Array.isArray(data?.result) ? data.result.length : 0
      const resultStr = JSON.stringify(data?.result ?? null, null, 2)
      const truncated = resultStr.slice(0, 1500) + (resultStr.length > 1500 ? ' ... [truncated]' : '')
      return `- ${e.description}\nQuery: ${e.expr}\nType: ${data?.resultType ?? 'unknown'}, ${resultCount} series/data\n${truncated}`
    }).join('\n\n')

    const systemPrompt = `You are a senior SRE writing an investigation report for your team. Write it like a real post-incident analysis — with your reasoning process, what you checked and why, what the data told you, and what conclusions you drew.

The report is a narrative document with embedded metric panels. It should read like a story: "We started by looking at X because... The data showed Y, which told us... This led us to check Z..."

## Initial hypothesis
${plan.hypothesis}

## Investigation Goal
${input.goal}

## Evidence Gathered
${evidenceSummary}

## Output (JSON)
{
  "summary": "1-2 sentence conclusion for the chat sidebar",
  "sections": [
    {
      "explanation": "Markdown narrative text. Write like a person thinking through the problem.",
      "panel": null
    },
    {
      "explanation": "Narrative text explaining WHY you looked at this metric, WHAT the data shows, and WHAT it means for the investigation.",
      "panel": {
        "title": "Panel Title",
        "description": "Brief panel description",
        "visualization": "time_series",
        "queries": [{ "refId": "A", "expr": "promql_here", "legendFormat": "{{label}}", "instant": false }],
        "width": 12,
        "height": 3,
        "unit": "short"
      }
    }
  ]
}

## Writing Style
- Write in first person plural ("We checked...", "Our investigation found...")
- Structure as a logical narrative: context → hypothesis → evidence → interpretation → conclusion
- Start with a text section setting the scene: what the problem is, what your initial thinking was, and how you approached the investigation
- For each evidence panel, explain your REASONING: why you checked this metric, what you expected to see, and what the actual data revealed. Connect each finding to the next — "This ruled out X, so we turned our attention to Y..."
- Don't just describe data mechanically ("The value is 0.043"). Instead, interpret it ("The error rate of 4.3% is significantly above the normal baseline of <0.1%, confirming our hypothesis that...")
- End with TWO text sections (no panels):
  1. **Conclusion**: what you found, what the root cause is (or isn't)
  2. **Recommendations**: If a root cause was found, give specific remediation steps (e.g. "Scale the payment-gateway deployment to 3 replicas", "Add a circuit breaker on the checkout→payment call"). If no root cause was found, give concrete next-step investigation suggestions — what logs to check, what services to trace, what dashboards to look at, what teams to contact (e.g. "Check application logs for checkout-service for unhandled exceptions", "Trace a failing checkout request end-to-end through Jaeger", "Review recent deployments to checkout and payment services")
- Be honest — if evidence is inconclusive or shows normal behavior, explain why that's actually an important finding ("The fact that CPU/memory are normal tells us this is NOT a resource issue, narrowing our search to...")

## Panel Rules
- Only create panels for the most important 3-6 findings
- Use the SAME working PromQL from evidence (don't invent new queries)
- stat/gauge panels need "instant": true in queries
- CRITICAL: Be honest. If metrics look normal, say so. Don't fabricate issues.`

    try {
      const resp = await this.deps.gateway.complete([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Analyze the evidence and write the investigation report.' },
      ], {
        model: this.deps.model,
        maxTokens: 4096,
        temperature: 0,
        responseFormat: 'json',
      })

      const parsed = parseLlmJson(resp.content) as AnalysisResult

      return {
        summary: typeof parsed.summary === 'string' ? parsed.summary : 'Investigation complete.',
        sections: Array.isArray(parsed.sections) ? parsed.sections : [],
      }
    }
    catch (err) {
      log.error({ err }, 'analyzeEvidence failed')
      const basicSummary = `Investigation of "${input.goal}" completed with evidence, but report generation failed.`
      return {
        summary: basicSummary,
        sections: [{ explanation: basicSummary }],
      }
    }
  }

  // Convert single raw panel to PanelConfig
  private toPanelConfig(
    raw: NonNullable<AnalysisSection['panel']>,
    row: number,
    col: number,
  ): PanelConfig {
    const visualization: PanelVisualization = VALID_VISUALIZATIONS.has(raw.visualization)
      ? raw.visualization as PanelVisualization
      : 'time_series'

    const queries: PanelQuery[] = (raw.queries ?? []).map((q) => ({
      refId: q.refId,
      expr: q.expr,
      legendFormat: q.legendFormat,
      instant: q.instant,
    }))

    return {
      id: randomUUID(),
      title: raw.title ?? 'Evidence',
      description: raw.description ?? '',
      queries,
      visualization,
      row,
      col,
      width: Math.min(12, Math.max(1, raw.width ?? 12)),
      height: Math.max(2, raw.height ?? 3),
      refreshIntervalSec: 30,
      unit: raw.unit,
      thresholds: raw.thresholds,
      sectionId: 'investigation',
      sectionLabel: 'Investigation Evidence',
    } as PanelConfig
  }
}
