import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Dashboard } from '@agentic-obs/common'
import { PanelEditorAgent } from './panel-editor-agent.js'

function createDashboard(): Dashboard {
  const now = new Date().toISOString()
  return {
    id: 'dash-1',
    type: 'dashboard',
    title: 'HTTP Latency Dashboard',
    description: '',
    prompt: '',
    userId: 'u1',
    status: 'ready',
    panels: [
      {
        id: 'panel-p95',
        title: 'Latency p95',
        description: 'P95 latency',
        visualization: 'stat',
        query: 'histogram_quantile(0.95, ...)',
        queries: [{ refId: 'A', expr: 'histogram_quantile(0.95, ...)', instant: true }],
        row: 0,
        col: 0,
        width: 3,
        height: 2,
      },
      {
        id: 'panel-p99',
        title: 'Latency p99',
        description: 'P99 latency',
        visualization: 'stat',
        query: 'histogram_quantile(0.99, ...)',
        queries: [{ refId: 'A', expr: 'histogram_quantile(0.99, ...)', instant: true }],
        row: 0,
        col: 3,
        width: 3,
        height: 2,
      },
    ],
    variables: [],
    refreshIntervalSec: 60,
    datasourceIds: [],
    useExistingMetrics: true,
    createdAt: now,
    updatedAt: now,
  }
}

describe('PanelEditorAgent', () => {
  const gateway = {
    complete: vi.fn(),
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('normalizes multi-step modify plans from the LLM', async () => {
    gateway.complete.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: 'Merged the p95 and p99 latency panels.',
        actions: [
          {
            type: 'remove_panels',
            panelIds: ['panel-p99'],
          },
          {
            type: 'modify_panel',
            panelId: 'panel-p95',
            patch: {
              title: 'Latency p95 and p99',
              visualization: 'time_series',
              queries: [
                { query: 'histogram_quantile(0.95, ...)' },
                { refId: 'B', promql: 'histogram_quantile(0.99, ...)' },
              ],
            },
          },
        ],
      }),
    })

    const agent = new PanelEditorAgent({
      gateway,
      model: 'test-model',
      panelAdderAgent: { addPanels: vi.fn() } as any,
    })

    const result = await agent.planEdit({
      userRequest: '把 p95 和 p99 这两个 panel 合并成 1 个',
      requestedAction: 'modify_panel',
      requestedArgs: {
        panelId: 'panel-p95',
        patch: {
          title: 'Latency p95 and p99',
          visualization: 'time_series',
          queries: [
            { query: 'histogram_quantile(0.95, ...)' },
            { promql: 'histogram_quantile(0.99, ...)' },
          ],
        },
      },
      dashboard: createDashboard(),
    })

    expect(result.summary).toContain('Merged')
    expect(result.actions).toHaveLength(2)
    expect(result.actions[0]).toMatchObject({
      type: 'modify_panel',
      panelId: 'panel-p95',
      patch: {
        title: 'Latency p95 and p99',
        visualization: 'time_series',
        query: 'histogram_quantile(0.95, ...)',
      },
    })
    expect(result.actions[0]?.type).toBe('modify_panel')
    if (result.actions[0]?.type === 'modify_panel') {
      expect(result.actions[0].patch.queries).toEqual([
        { refId: 'A', expr: 'histogram_quantile(0.95, ...)' },
        { refId: 'B', expr: 'histogram_quantile(0.99, ...)' },
      ])
    }
    expect(result.actions[1]).toEqual({
      type: 'remove_panels',
      panelIds: ['panel-p99'],
    })
  })

  it('passes through simple panel removals without calling the LLM', async () => {
    const agent = new PanelEditorAgent({
      gateway,
      model: 'test-model',
      panelAdderAgent: { addPanels: vi.fn() } as any,
    })

    const result = await agent.planEdit({
      userRequest: '删掉 p99 panel',
      requestedAction: 'remove_panels',
      requestedArgs: {
        panelIds: ['panel-p99'],
      },
      dashboard: createDashboard(),
    })

    expect(gateway.complete).not.toHaveBeenCalled()
    expect(result).toEqual({
      summary: 'Removed 1 panel(s).',
      actions: [{ type: 'remove_panels', panelIds: ['panel-p99'] }],
    })
  })

  it('can generate replacement panels as part of an edit plan', async () => {
    gateway.complete.mockResolvedValueOnce({
      content: JSON.stringify({
        summary: 'Split the latency stat into separate p95 and p99 panels.',
        actions: [
          {
            type: 'generate_panels',
            goal: 'Add two separate latency panels, one for p95 and one for p99.',
          },
          {
            type: 'remove_panels',
            panelIds: ['panel-p95'],
          },
        ],
      }),
    })

    const panelAdderAgent = {
      addPanels: vi.fn().mockResolvedValue({
        panels: [
          {
            id: 'panel-new-p95',
            title: 'Latency p95',
            description: 'P95 latency',
            visualization: 'time_series',
            queries: [{ refId: 'A', expr: 'histogram_quantile(0.95, ...)' }],
            row: 2,
            col: 0,
            width: 6,
            height: 3,
          },
          {
            id: 'panel-new-p99',
            title: 'Latency p99',
            description: 'P99 latency',
            visualization: 'time_series',
            queries: [{ refId: 'A', expr: 'histogram_quantile(0.99, ...)' }],
            row: 2,
            col: 6,
            width: 6,
            height: 3,
          },
        ],
        variables: [
          {
            name: 'service',
            label: 'Service',
            type: 'query',
            query: 'label_values(http_request_duration_seconds_bucket, service)',
            current: '',
            multi: true,
            includeAll: true,
          },
        ],
      }),
    }

    const agent = new PanelEditorAgent({
      gateway,
      model: 'test-model',
      panelAdderAgent: panelAdderAgent as any,
    })

    const result = await agent.planEdit({
      userRequest: '把这个单值 panel 拆成 p95 和 p99 两个面板',
      requestedAction: 'modify_panel',
      requestedArgs: {
        panelId: 'panel-p95',
        patch: {},
      },
      dashboard: createDashboard(),
    })

    expect(panelAdderAgent.addPanels).toHaveBeenCalledWith(expect.objectContaining({
      goal: 'Add two separate latency panels, one for p95 and one for p99.',
    }))
    expect(result.actions[0]).toMatchObject({
      type: 'add_panels',
      panels: expect.arrayContaining([
        expect.objectContaining({ id: 'panel-new-p95' }),
        expect.objectContaining({ id: 'panel-new-p99' }),
      ]),
    })
    expect(result.actions[1]).toMatchObject({
      type: 'remove_panels',
      panelIds: ['panel-p95'],
    })
    expect(result.actions[2]).toMatchObject({
      type: 'add_variable',
      variable: expect.objectContaining({ name: 'service' }),
    })
  })

  it('preserves panel size for rearrange requests that only move position', async () => {
    const agent = new PanelEditorAgent({
      gateway,
      model: 'test-model',
      panelAdderAgent: { addPanels: vi.fn() } as any,
    })

    const result = await agent.planEdit({
      userRequest: 'p99 latency放到第一个',
      requestedAction: 'rearrange',
      requestedArgs: {
        layout: [
          {
            panelId: 'panel-p99',
            row: 0,
            col: 0,
            width: 12,
            height: 6,
          },
        ],
      },
      dashboard: createDashboard(),
    })

    expect(result.actions).toEqual([
      {
        type: 'rearrange',
        layout: [
          {
            panelId: 'panel-p99',
            row: 0,
            col: 0,
            width: 3,
            height: 2,
          },
        ],
      },
    ])
  })
})
