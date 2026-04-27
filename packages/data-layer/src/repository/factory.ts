import type { SqliteClient } from '../db/sqlite-client.js';
import type {
  IIncidentRepository,
  IFeedItemRepository,
  IApprovalRequestRepository,
  IShareLinkRepository,
  IDashboardRepository,
  IFolderRepository,
  IAlertRuleRepository,
  INotificationRepository,
  IVersionRepository,
  IInvestigationReportRepository,
  IPostMortemRepository,
  IChatSessionRepository,
  IChatMessageRepository,
  IChatSessionEventRepository,
} from './interfaces.js';
import type { IInvestigationRepository as SqliteInvestigationRepositoryInterface } from './sqlite/investigation.js';
import type {
  IInstanceConfigRepository,
  IDatasourceRepository,
  INotificationChannelRepository,
} from '@agentic-obs/common';
import type { IOpsConnectorRepository } from './types/ops-connector.js';
import type {
  IGatewayInvestigationStore,
  IGatewayIncidentStore,
  IGatewayApprovalStore,
  IGatewayShareStore,
  IGatewayDashboardStore,
} from '../stores/interfaces.js';

import { InvestigationRepository } from './sqlite/investigation.js';
import { SqliteIncidentRepository } from './sqlite/incident.js';
import { SqliteFeedItemRepository } from './sqlite/feed.js';
import { SqliteApprovalRequestRepository } from './sqlite/approval.js';
import { SqliteShareLinkRepository } from './sqlite/share.js';
import { SqliteDashboardRepository } from './sqlite/dashboard.js';
import { SqliteFolderRepository } from './sqlite/folder.js';
import { SqliteAlertRuleRepository } from './sqlite/alert-rule.js';
import { SqliteNotificationRepository } from './sqlite/notification.js';
import { SqliteVersionRepository } from './sqlite/version.js';
import { SqliteInvestigationReportRepository } from './sqlite/investigation-report.js';
import { SqlitePostMortemRepository } from './sqlite/post-mortem.js';
import { SqliteChatSessionRepository } from './sqlite/chat-session.js';
import { SqliteChatMessageRepository } from './sqlite/chat-message.js';
import { SqliteChatSessionEventRepository } from './sqlite/chat-session-event.js';
import { InstanceConfigRepository } from './sqlite/instance-config.js';
import { DatasourceRepository } from './sqlite/datasource.js';
import { NotificationChannelRepository } from './sqlite/notification-channel.js';
import { OpsConnectorRepository } from './sqlite/ops-connector.js';

/**
 * Extended repositories available with the SQLite backend.
 * Includes all entity types that were previously only available via in-memory stores.
 *
 * Investigation/incident/approval/share/dashboard/conversation repositories are
 * typed as intersections of the repository interface and the gateway store
 * interface — the SQLite classes implement both shapes so router factories that
 * only want the gateway surface can consume them directly without casts.
 */
export interface SqliteRepositories {
  investigations: SqliteInvestigationRepositoryInterface & IGatewayInvestigationStore;
  incidents: IIncidentRepository & IGatewayIncidentStore;
  feedItems: IFeedItemRepository;
  approvals: IApprovalRequestRepository & IGatewayApprovalStore;
  shares: IShareLinkRepository & IGatewayShareStore;
  dashboards: IDashboardRepository & IGatewayDashboardStore;
  folders: IFolderRepository;
  alertRules: IAlertRuleRepository;
  notifications: INotificationRepository;
  versions: IVersionRepository;
  investigationReports: IInvestigationReportRepository;
  postMortems: IPostMortemRepository;
  chatSessions: IChatSessionRepository;
  chatMessages: IChatMessageRepository;
  chatSessionEvents: IChatSessionEventRepository;
  // W2 / T2.2 — instance-scoped config (replaces setup-config.json).
  instanceConfig: IInstanceConfigRepository;
  datasources: IDatasourceRepository;
  notificationChannels: INotificationChannelRepository;
  opsConnectors: IOpsConnectorRepository;
}

export function createSqliteRepositories(db: SqliteClient): SqliteRepositories {
  return {
    investigations: new InvestigationRepository(db),
    incidents: new SqliteIncidentRepository(db),
    feedItems: new SqliteFeedItemRepository(db),
    approvals: new SqliteApprovalRequestRepository(db),
    shares: new SqliteShareLinkRepository(db),
    dashboards: new SqliteDashboardRepository(db),
    folders: new SqliteFolderRepository(db),
    alertRules: new SqliteAlertRuleRepository(db),
    notifications: new SqliteNotificationRepository(db),
    versions: new SqliteVersionRepository(db),
    investigationReports: new SqliteInvestigationReportRepository(db),
    postMortems: new SqlitePostMortemRepository(db),
    chatSessions: new SqliteChatSessionRepository(db),
    chatMessages: new SqliteChatMessageRepository(db),
    chatSessionEvents: new SqliteChatSessionEventRepository(db),
    instanceConfig: new InstanceConfigRepository(db),
    datasources: new DatasourceRepository(db),
    notificationChannels: new NotificationChannelRepository(db),
    opsConnectors: new OpsConnectorRepository(db),
  };
}
