// Core agent — single autonomous orchestrator with primitive tools

export { OrchestratorAgent } from './orchestrator-agent.js'
export type { OrchestratorDeps } from './orchestrator-agent.js'

export { AlertRuleAgent } from './alert-rule-agent.js'
export type { AlertRuleContext, AlertRuleGenerationResult } from './alert-rule-agent.js'

export { ActionExecutor } from './action-executor.js'

export { ReActLoop } from './react-loop.js'
export type { ReActStep, ReActObservation, ReActDeps } from './react-loop.js'

// Agent runtime types
export * from './agent-types.js'
export * from './agent-definition.js'
export * from './agent-events.js'
export { agentRegistry } from './agent-registry.js'

export type {
  IDashboardAgentStore,
  IConversationStore,
  IInvestigationReportStore,
  IInvestigationStore,
  IAlertRuleStore,
  DatasourceConfig,
} from './types.js'
