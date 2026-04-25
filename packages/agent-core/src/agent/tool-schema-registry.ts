import type { ToolDefinition } from '@agentic-obs/llm-gateway';

/**
 * Hand-written JSON-schema registry for every action handler the agent can
 * invoke. The model receives these via the native tool_use API (no prose).
 *
 * Adding a new action handler? Add an entry here too. The orchestrator
 * `toolsForAgent()` throws at startup if any name in `agent-registry.ts
 * allowedTools` is missing from this map — drift will be caught immediately.
 *
 * SKELETON: Team A populates the names + empty schemas; Team F fills in
 * descriptions + properties. The skeleton lets parallel teams compile.
 */
export const TOOL_SCHEMAS: Record<string, ToolDefinition> = {
  // Discovery
  'datasources.list': { name: 'datasources.list', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Metrics (8)
  'metrics.query': { name: 'metrics.query', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'metrics.range_query': { name: 'metrics.range_query', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'metrics.labels': { name: 'metrics.labels', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'metrics.label_values': { name: 'metrics.label_values', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'metrics.series': { name: 'metrics.series', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'metrics.metadata': { name: 'metrics.metadata', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'metrics.metric_names': { name: 'metrics.metric_names', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'metrics.validate': { name: 'metrics.validate', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Logs (3)
  'logs.query': { name: 'logs.query', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'logs.labels': { name: 'logs.labels', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'logs.label_values': { name: 'logs.label_values', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Changes
  'changes.list_recent': { name: 'changes.list_recent', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Dashboard (8)
  'dashboard.create': { name: 'dashboard.create', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'dashboard.list': { name: 'dashboard.list', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'dashboard.add_panels': { name: 'dashboard.add_panels', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'dashboard.remove_panels': { name: 'dashboard.remove_panels', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'dashboard.modify_panel': { name: 'dashboard.modify_panel', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'dashboard.set_title': { name: 'dashboard.set_title', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'dashboard.add_variable': { name: 'dashboard.add_variable', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Investigation (4)
  'investigation.create': { name: 'investigation.create', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'investigation.list': { name: 'investigation.list', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'investigation.add_section': { name: 'investigation.add_section', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'investigation.complete': { name: 'investigation.complete', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Alerts (5)
  'create_alert_rule': { name: 'create_alert_rule', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'modify_alert_rule': { name: 'modify_alert_rule', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'delete_alert_rule': { name: 'delete_alert_rule', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'alert_rule.list': { name: 'alert_rule.list', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'alert_rule.history': { name: 'alert_rule.history', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Other
  'web.search': { name: 'web.search', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'navigate': { name: 'navigate', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  // Terminal
  'reply': { name: 'reply', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'finish': { name: 'finish', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
  'ask_user': { name: 'ask_user', description: 'TODO', input_schema: { type: 'object', properties: {}, required: [] } },
};

export function toolsForAgent(allowedTools: readonly string[]): ToolDefinition[] {
  return allowedTools.map((name) => {
    const schema = TOOL_SCHEMAS[name];
    if (!schema) throw new Error(`Tool schema missing for "${name}" — add an entry in tool-schema-registry.ts`);
    return schema;
  });
}
