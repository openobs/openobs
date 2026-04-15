// @agentic-obs/agent-core

export * from './adapters/index.js';

export {
  OrchestratorAgent,
  type OrchestratorDeps,
  // Compat alias — api-gateway still imports under the old name
  OrchestratorAgent as DashboardOrchestratorAgent,
  type OrchestratorDeps as DashboardOrchestratorDeps,
  AlertRuleAgent,
  type AlertRuleContext,
  ActionExecutor,
  type IDashboardAgentStore,
  type IConversationStore,
  type IInvestigationReportStore,
  type IAlertRuleStore,
  type IInvestigationStore,
  type DatasourceConfig,
  // Compat aliases
  type IConversationStore as IDashboardConversationStore,
  type IAlertRuleStore as IDashboardAlertRuleStore,
  type IInvestigationStore as IDashboardInvestigationStore,
  type DatasourceConfig as DashboardDatasourceConfig,
} from './agent/index.js';

export type { Investigation, InvestigationPlan, InvestigationStatus } from '@agentic-obs/common';
