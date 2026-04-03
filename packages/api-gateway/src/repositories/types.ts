// Gateway-level repository interfaces for dependency injection.
// All types are now defined in @agentic-obs/data-layer and re-exported here
// for backward compatibility.

export type {
  MaybeAsync,
  IGatewayInvestigationStore,
  IGatewayIncidentStore,
  IGatewayFeedStore,
  IGatewayApprovalStore,
  IGatewayShareStore,
  IGatewayDashboardStore,
  IConversationStore,
  GatewayStores,
} from '@agentic-obs/data-layer'
