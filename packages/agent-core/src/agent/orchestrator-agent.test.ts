import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dashboard, DashboardMessage, DashboardSseEvent } from '@agentic-obs/common'
import { OrchestratorAgent } from './orchestrator-agent.js'

function createDashboard(): Dashboard {
  const now = new Date().toISOString()
  return {
    id: 'dash-1',
    type: 'dashboard',
    title: 'Latency',
    description: '',
    prompt: '',
    userId: 'u1',
    status: 'ready',
    panels: [],
    variables: [],
    refreshIntervalSec: 60,
    datasourceIds: [],
    useExistingMetrics: true,
    createdAt: now,
    updatedAt: now,
  }
}

describe('OrchestratorAgent structured alert follow-up', () => {
  const sendEvent = vi.fn()
  const gateway = {
    complete: vi.fn(),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('modifies the active alert without calling the LLM for a threshold follow-up', async () => {
    const dashboard = createDashboard()
    gateway.complete.mockResolvedValueOnce({ content: 'Updated the existing alert to trigger at 150ms.' })
    const history: DashboardMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'Created alert.',
        actions: [
          {
            type: 'create_alert_rule',
            ruleId: 'alert_1',
            name: 'HighHTTPPLatency90thPercentile',
            severity: 'high',
            query: 'histogram_quantile(0.9, ...)',
            operator: '>',
            threshold: 300,
            forDurationSec: 300,
            evaluationIntervalSec: 60,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ]

    const alertRuleStore = {
      create: vi.fn(),
      findAll: vi.fn().mockResolvedValue({
        list: [
          {
            id: 'alert_1',
            name: 'HighHTTPPLatency90thPercentile',
            severity: 'high',
            evaluationIntervalSec: 60,
            condition: {
              query: 'histogram_quantile(0.9, ...)',
              operator: '>',
              threshold: 300,
              forDurationSec: 300,
            },
          },
        ],
      }),
      findById: vi.fn().mockResolvedValue({
        id: 'alert_1',
        name: 'HighHTTPPLatency90thPercentile',
        condition: {
          query: 'histogram_quantile(0.9, ...)',
          operator: '>',
          threshold: 300,
          forDurationSec: 300,
        },
      }),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn(),
    }

    const agent = new OrchestratorAgent({
      gateway,
      model: 'test-model',
      store: {
        findById: vi.fn().mockResolvedValue(dashboard),
        update: vi.fn(),
        updatePanels: vi.fn(),
        updateVariables: vi.fn(),
      },
      conversationStore: {
        addMessage: vi.fn(),
        getMessages: vi.fn().mockResolvedValue(history),
        clearMessages: vi.fn(),
        deleteConversation: vi.fn(),
      },
      investigationReportStore: { save: vi.fn() },
      alertRuleStore: alertRuleStore as any,
      sendEvent,
    })

    const reply = await agent.handleMessage('dash-1', 'just change it to 150ms and notify me')

    expect(gateway.complete).toHaveBeenCalledTimes(1)
    expect(alertRuleStore.update).toHaveBeenCalledWith(
      'alert_1',
      expect.objectContaining({
        condition: expect.objectContaining({
          threshold: 150,
          operator: '>',
        }),
      }),
    )
    expect(reply).toContain('150ms')
  })

  it('deletes the active alert without calling the LLM for a delete follow-up', async () => {
    const dashboard = createDashboard()
    gateway.complete.mockResolvedValueOnce({ content: 'Deleted the existing alert.' })
    const history: DashboardMessage[] = [
      {
        id: 'm1',
        role: 'assistant',
        content: 'Created alert.',
        actions: [
          {
            type: 'create_alert_rule',
            ruleId: 'alert_1',
            name: 'HighHTTPPLatency90thPercentile',
            severity: 'high',
            query: 'histogram_quantile(0.9, ...)',
            operator: '>',
            threshold: 300,
            forDurationSec: 300,
            evaluationIntervalSec: 60,
          },
        ],
        timestamp: new Date().toISOString(),
      },
    ]

    const deleteFn = vi.fn().mockResolvedValue(true)

    const agent = new OrchestratorAgent({
      gateway,
      model: 'test-model',
      store: {
        findById: vi.fn().mockResolvedValue(dashboard),
        update: vi.fn(),
        updatePanels: vi.fn(),
        updateVariables: vi.fn(),
      },
      conversationStore: {
        addMessage: vi.fn(),
        getMessages: vi.fn().mockResolvedValue(history),
        clearMessages: vi.fn(),
        deleteConversation: vi.fn(),
      },
      investigationReportStore: { save: vi.fn() },
      alertRuleStore: {
        create: vi.fn(),
        findAll: vi.fn().mockResolvedValue({
          list: [
            {
              id: 'alert_1',
              name: 'HighHTTPPLatency90thPercentile',
              severity: 'high',
              condition: {
                query: 'histogram_quantile(0.9, ...)',
                operator: '>',
                threshold: 300,
                forDurationSec: 300,
              },
            },
          ],
        }),
        delete: deleteFn,
      } as any,
      sendEvent,
    })

    const reply = await agent.handleMessage('dash-1', 'delete it')

    expect(gateway.complete).toHaveBeenCalledTimes(1)
    expect(deleteFn).toHaveBeenCalledWith('alert_1')
    expect(reply.toLowerCase()).toContain('deleted')
  })
})

describe('OrchestratorAgent panel explanation', () => {
  const sendEvent = vi.fn()
  const gateway = {
    complete: vi.fn(),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('explains a panel using live data without routing to investigation', async () => {
    const now = new Date().toISOString()
    const dashboard: Dashboard = {
      id: 'dash-1',
      type: 'dashboard',
      title: 'Latency',
      description: '',
      prompt: '',
      userId: 'u1',
      status: 'ready',
      panels: [
        {
          id: 'panel-avg',
          title: 'Average Latency',
          description: '',
          visualization: 'time_series',
          queries: [{ refId: 'A', expr: 'rate(http_request_duration_seconds_sum[5m]) / rate(http_request_duration_seconds_count[5m])' }],
          row: 0,
          col: 0,
          width: 6,
          height: 3,
        },
      ],
      variables: [],
      refreshIntervalSec: 60,
      datasourceIds: [],
      useExistingMetrics: true,
      createdAt: now,
      updatedAt: now,
    }

    gateway.complete.mockResolvedValueOnce({
      content: 'Over the past hour, Average Latency has been stable around 0.24s, ranging from 0.21s to 0.27s with no significant degradation trend.',
    })

    const agent = new OrchestratorAgent({
      gateway,
      model: 'test-model',
      store: {
        findById: vi.fn().mockResolvedValue(dashboard),
        update: vi.fn(),
        updatePanels: vi.fn(),
        updateVariables: vi.fn(),
      },
      conversationStore: {
        addMessage: vi.fn(),
        getMessages: vi.fn().mockResolvedValue([]),
        clearMessages: vi.fn(),
        deleteConversation: vi.fn(),
      },
      investigationReportStore: { save: vi.fn() },
      alertRuleStore: { create: vi.fn() } as any,
      metricsAdapter: {
        listMetricNames: vi.fn(),
        listLabels: vi.fn(),
        listLabelValues: vi.fn(),
        findSeries: vi.fn(),
        fetchMetadata: vi.fn(),
        instantQuery: vi.fn(),
        rangeQuery: vi.fn().mockResolvedValue([
          {
            metric: {},
            values: [
              [1, '0.21'],
              [2, '0.24'],
              [3, '0.27'],
            ],
          },
        ]),
        testQuery: vi.fn(),
        isHealthy: vi.fn(),
      },
      timeRange: {
        start: '2026-04-08T00:00:00.000Z',
        end: '2026-04-08T01:00:00.000Z',
      },
      sendEvent,
    })

    const reply = await agent.handleMessage('dash-1', 'explain the Average Latency data trend')

    expect(reply).toContain('Average Latency')
    expect(gateway.complete).toHaveBeenCalledTimes(1)
    expect(sendEvent).toHaveBeenCalledWith({
      type: 'reply',
      content: 'Over the past hour, Average Latency has been stable around 0.24s, ranging from 0.21s to 0.27s with no significant degradation trend.',
    })
  })
})

describe('OrchestratorAgent investigate artifact sync', () => {
  const sendEvent = vi.fn()
  const gateway = {
    complete: vi.fn(),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists a real investigation when dashboard investigate completes', async () => {
    const dashboard = createDashboard()
    const investigationStore = {
      create: vi.fn().mockResolvedValue({
        id: 'inv-1',
        intent: 'Why is p95 high?',
        sessionId: 'ses_dash_1',
        userId: 'u1',
      }),
      updatePlan: vi.fn(),
      updateResult: vi.fn(),
      updateStatus: vi.fn(),
    }
    const investigationReportStore = {
      save: vi.fn(),
    }

    const agent = new OrchestratorAgent({
      gateway,
      model: 'test-model',
      store: {
        findById: vi.fn().mockResolvedValue(dashboard),
        update: vi.fn(),
        updatePanels: vi.fn(),
        updateVariables: vi.fn(),
      },
      conversationStore: {
        addMessage: vi.fn(),
        getMessages: vi.fn().mockResolvedValue([]),
        clearMessages: vi.fn(),
        deleteConversation: vi.fn(),
      },
      investigationReportStore: investigationReportStore as any,
      investigationStore: investigationStore as any,
      alertRuleStore: { create: vi.fn() } as any,
      sendEvent,
    })

    ;(agent as any).investigationAgent = {
      investigate: vi.fn().mockResolvedValue({
        summary: 'P95 is high because checkout traffic increased.',
        report: {
          summary: 'P95 is high because checkout traffic increased.',
          sections: [
            {
              type: 'evidence',
              content: 'Checkout route dominates latency.',
              panel: {
                id: 'panel-1',
                title: 'Checkout latency',
                description: '',
                visualization: 'time_series',
                queries: [{ refId: 'A', expr: 'histogram_quantile(0.95, ...)' }],
                row: 0,
                col: 0,
                width: 6,
                height: 3,
              },
            },
          ],
        },
        panels: [],
      }),
    }
    ;(agent as any).verifierAgent = {
      verify: vi.fn().mockResolvedValue({ status: 'passed', summary: 'ok', issues: [], checksRun: [] }),
    }

    await (agent as any).executeAction(
      'dash-1',
      { thought: 'investigate', action: 'investigate', args: { goal: 'Why is p95 high?' } },
      'Why is p95 high?',
    )

    expect(investigationStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'Why is p95 high?',
        userId: 'u1',
      }),
    )
    expect(investigationStore.updatePlan).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        objective: 'Why is p95 high?',
      }),
    )
    expect(investigationStore.updateResult).toHaveBeenCalledWith(
      'inv-1',
      expect.objectContaining({
        conclusion: expect.objectContaining({
          summary: 'P95 is high because checkout traffic increased.',
        }),
      }),
    )
    expect(investigationStore.updateStatus).toHaveBeenCalledWith('inv-1', 'completed')
    expect(investigationReportStore.save).toHaveBeenCalledTimes(2)
    expect(investigationReportStore.save).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        dashboardId: 'inv-1',
        goal: 'Why is p95 high?',
      }),
    )
  })
})
