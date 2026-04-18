import express from 'express';
import type { Application } from 'express';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { cors } from './middleware/cors.js';
import { defaultRateLimiter, createRateLimiter } from './middleware/rate-limiter.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.js';
import { sessionsRouter } from './routes/sessions.js';
import { createInvestigationRouter, openApiRouter } from './routes/investigation/router.js';
import { createFeedRouter } from './routes/feed.js';
import { createSharedRouter } from './routes/shared.js';
import { createMetaRouter } from './routes/meta.js';
import { createApprovalRouter } from './routes/approval.js';
import { metricsRouter } from './routes/metrics.js';
import { createWebhookRouter } from './routes/webhooks.js';
import { createInvestigationReportRouter } from './routes/investigation-reports.js';
import { createSetupRouter } from './routes/setup.js';
import { datasourcesRouter } from './routes/datasources.js';
import { createQueryRouter } from './routes/dashboard/query.js';
import { createDashboardRouter } from './routes/dashboard/router.js';
import { createAlertRulesRouter } from './routes/alert-rules.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createVersionRouter } from './routes/versions.js';
import { createOrgsRouter } from './routes/orgs.js';
import { createOrgRouter } from './routes/org.js';
import { OrgService } from './services/org-service.js';
import { createFolderRouter } from './routes/folders.js';
import { createSearchRouter } from './routes/search.js';
import { createChatRouter } from './routes/chat.js';
import {
  createSqliteClient,
  createSqliteRepositories,
  ensureSchema,
  applyNamedMigrations,
  EventEmittingFeedRepository,
  EventEmittingApprovalRepository,
  EventEmittingAlertRuleRepository,
  defaultInvestigationStore,
  defaultInvestigationReportStore,
  defaultNotificationStore,
  defaultAlertRuleStore,
  defaultDashboardStore,
  defaultConversationStore,
  defaultShareStore,
  defaultFolderStore,
  defaultVersionStore,
  feedStore,
  incidentStore,
  approvalStore,
  postMortemStore,
  UserRepository,
  UserAuthRepository,
  UserAuthTokenRepository,
  OrgRepository,
  OrgUserRepository,
  QuotaRepository,
  ApiKeyRepository,
  AuditLogRepository,
  PreferencesRepository,
  // Wave 2 / T3 RBAC
  RoleRepository,
  PermissionRepository,
  UserRoleRepository,
  TeamRoleRepository,
  TeamMemberRepository,
  FolderRepository,
  seedRbacForOrg,
} from '@agentic-obs/data-layer';
import { createAuthSubsystem } from './auth/auth-manager.js';
import { seedAdminIfNeeded } from './auth/seed-admin.js';
import { createAuthRouter } from './routes/auth.js';
import { createUserRouter } from './routes/user.js';
import { createAdminRouter } from './routes/admin.js';
import {
  createAuthMiddleware,
  setAuthMiddleware,
} from './middleware/auth.js';
import { createOrgContextMiddleware } from './middleware/org-context.js';
import { setBootstrapHasUsers } from './routes/setup.js';
// Wave 2 / T3 — RBAC service, routes, resolvers.
import { AccessControlService } from './services/accesscontrol-service.js';
import { createAccessControlRouter } from './routes/access-control.js';
import { createUserPermissionsRouter } from './routes/user-permissions.js';
import { createResolverRegistry } from './rbac/resolvers/index.js';
import type { SqliteRepositories } from '@agentic-obs/data-layer';
import { createLogger, requestLogger, GracefulShutdown, ShutdownPriority } from '@agentic-obs/common';
import { registerStore, loadAll, flushStores, markDirty } from './persistence.js';

const log = createLogger('api-gateway');

const DATA_DIR = process.env['DATA_DIR'] || join(process.cwd(), '.uname-data');

function buildSqliteRepositories(): SqliteRepositories & {
  _sqliteClient: ReturnType<typeof createSqliteClient>;
} {
  const dbPath = process.env['SQLITE_PATH'] || join(DATA_DIR, 'openobs.db');
  const db = createSqliteClient({ path: dbPath });
  ensureSchema(db);
  // Apply the name-based auth/perm migrations (001_org, 002_user, etc.).
  applyNamedMigrations(db);
  return Object.assign(createSqliteRepositories(db), { _sqliteClient: db });
}

function mountStaticAssets(app: Application): void {
  const webDistCandidates = [
    join(dirname(fileURLToPath(import.meta.url)), '../../web/dist'),
    join(dirname(fileURLToPath(import.meta.url)), '../../../web/dist'),
  ];
  const webDist = webDistCandidates.find((p) => existsSync(p));
  if (webDist) {
    app.use(express.static(webDist));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/'))
        return next();
      res.sendFile(join(webDist, 'index.html'));
    });
  }
}

function mountCommonRoutes(app: Application): void {
  app.use('/api/health', healthRouter);
  app.use('/api/sessions', sessionsRouter);
  app.use('/api/openapi.json', openApiRouter);
  app.use('/api/webhooks', createWebhookRouter());
  app.use('/api/metrics', metricsRouter);
  app.use('/api/setup', createSetupRouter());
  app.use('/api/datasources', datasourcesRouter);
  app.use('/api/query', createQueryRouter());
}

export function createApp(): Application {
  const app = express();

  // Parse JSON bodies
  app.use(express.json());

  // Structured request logging + correlation ID injection
  app.use(requestLogger);

  // CORS
  app.use(cors);

  // Rate limiting on all routes
  app.use(defaultRateLimiter);

  // Relaxed rate limiter for dashboard query routes
  const queryRateLimiter = createRateLimiter({ windowMs: 60_000, max: 600 });
  app.use('/api/query', queryRateLimiter);

  // Determine persistence backend
  const dbUrl = process.env['DATABASE_URL'];
  const useSqlite = !dbUrl;

  // Mount common routes shared across all backends
  mountCommonRoutes(app);

  if (useSqlite) {
    // -- SQLite mode: all persistence via SQLite repos
    const repos = buildSqliteRepositories();
    // — Auth subsystem wiring (Wave 2 / T2) ————————————————————————
    const sqliteDb = repos._sqliteClient;
    const authRepos = {
      users: new UserRepository(sqliteDb),
      userAuth: new UserAuthRepository(sqliteDb),
      userAuthTokens: new UserAuthTokenRepository(sqliteDb),
      orgs: new OrgRepository(sqliteDb),
      orgUsers: new OrgUserRepository(sqliteDb),
      auditLog: new AuditLogRepository(sqliteDb),
      apiKeys: new ApiKeyRepository(sqliteDb),
      preferences: new PreferencesRepository(sqliteDb),
    };
    void (async () => {
      try {
        await seedAdminIfNeeded(authRepos);
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : err },
          'seed admin failed',
        );
      }
    })();
    void (async () => {
      const authSub = await createAuthSubsystem(authRepos);
      const authMw = createAuthMiddleware({
        sessions: authSub.sessions,
        users: authRepos.users,
        orgUsers: authRepos.orgUsers,
        apiKeys: authRepos.apiKeys,
      });
      setAuthMiddleware(authMw);
      setBootstrapHasUsers(async () => {
        const { total } = await authRepos.users.list({ limit: 1 });
        return total > 0;
      });
      // Mount the auth / user / admin routers after the subsystem is built.
      // These endpoints are public or self-authenticating so mounting them
      // lazily is safe — requests that arrive before this resolves see a 503
      // from the auth-middleware shim, not an auth bypass.
      app.use(
        '/api/user',
        authMw,
        createOrgContextMiddleware({ orgUsers: authRepos.orgUsers }),
        createUserRouter({
          users: authRepos.users,
          userAuth: authRepos.userAuth,
          orgUsers: authRepos.orgUsers,
          preferences: authRepos.preferences,
          sessions: authSub.sessions,
          audit: authSub.audit,
        }),
      );
      app.use(
        '/api',
        createAuthRouter({
          users: authRepos.users,
          userAuth: authRepos.userAuth,
          orgUsers: authRepos.orgUsers,
          sessions: authSub.sessions,
          local: authSub.local,
          github: authSub.github,
          google: authSub.google,
          generic: authSub.generic,
          ldap: authSub.ldap,
          saml: authSub.saml,
          audit: authSub.audit,
          defaultOrgId: 'org_main',
        }),
      );
      app.use(
        '/api/admin',
        authMw,
        createAdminRouter({
          users: authRepos.users,
          userAuthTokens: authRepos.userAuthTokens,
          auditLog: authRepos.auditLog,
          sessions: authSub.sessions,
          audit: authSub.audit,
        }),
      );

      // -- Wave 2 / T3 — RBAC ------------------------------------------------
      // Construct the access-control service, seed the role catalog into the
      // default org (idempotent), and mount:
      //   - /api/user/permissions   (authenticated user's resolved perms)
      //   - /api/access-control/*   (role CRUD, assignments, etc.)
      const rbacRoleRepo = new RoleRepository(sqliteDb);
      const rbacPermissionRepo = new PermissionRepository(sqliteDb);
      const rbacUserRoles = new UserRoleRepository(sqliteDb);
      const rbacTeamRoles = new TeamRoleRepository(sqliteDb);
      const rbacTeamMembers = new TeamMemberRepository(sqliteDb);
      const rbacFolders = new FolderRepository(sqliteDb);

      try {
        await seedRbacForOrg(sqliteDb, 'org_main');
      } catch (err) {
        log.error(
          { err: err instanceof Error ? err.message : err },
          'seed rbac failed',
        );
      }

      const accessControl = new AccessControlService({
        permissions: rbacPermissionRepo,
        roles: rbacRoleRepo,
        userRoles: rbacUserRoles,
        teamRoles: rbacTeamRoles,
        teamMembers: rbacTeamMembers,
        orgUsers: authRepos.orgUsers,
        resolvers: (orgId) =>
          createResolverRegistry({ folders: rbacFolders, orgId }),
      });

      app.use(
        '/api/user',
        authMw,
        createOrgContextMiddleware({ orgUsers: authRepos.orgUsers }),
        createUserPermissionsRouter(accessControl),
      );

      app.use(
        '/api/access-control',
        authMw,
        createOrgContextMiddleware({ orgUsers: authRepos.orgUsers }),
        createAccessControlRouter({
          ac: accessControl,
          roleRepo: rbacRoleRepo,
          permissionRepo: rbacPermissionRepo,
          userRoles: rbacUserRoles,
          teamRoles: rbacTeamRoles,
          db: sqliteDb,
        }),
      );

      // -- Wave 3 / T4.1 — Org CRUD + membership ----------------------------
      const quotasRepo = new QuotaRepository(sqliteDb);
      const orgService = new OrgService({
        orgs: authRepos.orgs,
        orgUsers: authRepos.orgUsers,
        users: authRepos.users,
        quotas: quotasRepo,
        audit: authSub.audit,
        db: sqliteDb,
        defaultOrgId: 'org_main',
      });

      app.use(
        '/api/orgs',
        authMw,
        // Cross-org endpoints. orgContext middleware is omitted because
        // server-admin flows here (list-all, create new org) don't require
        // a specific current org.
        createOrgsRouter({ orgs: orgService, ac: accessControl }),
      );

      app.use(
        '/api/org',
        authMw,
        createOrgContextMiddleware({ orgUsers: authRepos.orgUsers }),
        createOrgRouter({
          orgs: orgService,
          ac: accessControl,
          preferences: authRepos.preferences,
        }),
      );
    })().catch((err) => {
      log.error(
        { err: err instanceof Error ? err.message : err },
        'failed to initialize auth subsystem',
      );
    });

    // Wrap repos with event emitters for pub/sub
    const eventFeedStore = new EventEmittingFeedRepository(repos.feedItems);
    const eventApprovalStore = new EventEmittingApprovalRepository(repos.approvals);
    const eventAlertRuleStore = new EventEmittingAlertRuleRepository(repos.alertRules);

    app.use('/api/investigations', createInvestigationRouter({
      store: repos.investigations,
      feed: eventFeedStore,
      shareRepo: repos.shares,
      reportStore: repos.investigationReports,
    }));
    app.use('/api/feed', createFeedRouter(eventFeedStore));
    app.use('/api/shared', createSharedRouter({
      shareRepo: repos.shares,
      investigationStore: repos.investigations,
    }));
    app.use('/api/meta', createMetaRouter({
      investigationStore: repos.investigations,
      feedStore: eventFeedStore,
    }));
    app.use('/api/approvals', createApprovalRouter(eventApprovalStore));
    app.use('/api/notifications', createNotificationsRouter({
      notificationStore: repos.notifications,
      alertRuleStore: eventAlertRuleStore,
    }));
    app.use('/api/investigation-reports', createInvestigationReportRouter(repos.investigationReports));
    app.use('/api/dashboards', createDashboardRouter({
      store: repos.dashboards,
      conversationStore: repos.conversations,
      investigationReportStore: repos.investigationReports,
      alertRuleStore: eventAlertRuleStore,
      investigationStore: repos.investigations,
      feedStore: eventFeedStore,
    }));
    app.use('/api/chat', createChatRouter({
      dashboardStore: repos.dashboards,
      conversationStore: repos.conversations,
      investigationReportStore: repos.investigationReports,
      alertRuleStore: eventAlertRuleStore,
      investigationStore: repos.investigations,
      chatSessionStore: repos.chatSessions,
      chatMessageStore: repos.chatMessages,
      chatEventStore: repos.chatSessionEvents,
    }));
    app.use('/api/alert-rules', createAlertRulesRouter({
      alertRuleStore: eventAlertRuleStore,
      investigationStore: repos.investigations,
      feedStore: eventFeedStore,
      reportStore: repos.investigationReports,
    }));
    app.use('/api/folders', createFolderRouter(repos.folders));
    app.use('/api/search', createSearchRouter({
      dashboardStore: repos.dashboards,
      alertRuleStore: eventAlertRuleStore,
      folderStore: repos.folders,
    }));
    app.use('/api/versions', createVersionRouter(repos.versions));
  } else {
    // -- Legacy in-memory mode with JSON persistence
    app.use('/api/investigations', createInvestigationRouter({
      store: defaultInvestigationStore,
      feed: feedStore,
      shareRepo: defaultShareStore,
      reportStore: defaultInvestigationReportStore,
    }));
    app.use('/api/feed', createFeedRouter(feedStore));
    app.use('/api/shared', createSharedRouter({
      shareRepo: defaultShareStore,
      investigationStore: defaultInvestigationStore,
    }));
    app.use('/api/meta', createMetaRouter({
      investigationStore: defaultInvestigationStore,
      feedStore,
    }));
    app.use('/api/approvals', createApprovalRouter(approvalStore));
    app.use('/api/notifications', createNotificationsRouter({
      notificationStore: defaultNotificationStore,
      alertRuleStore: defaultAlertRuleStore,
    }));
    app.use('/api/investigation-reports', createInvestigationReportRouter(defaultInvestigationReportStore));
    app.use('/api/dashboards', createDashboardRouter({
      store: defaultDashboardStore,
      conversationStore: defaultConversationStore,
      investigationReportStore: defaultInvestigationReportStore,
      alertRuleStore: defaultAlertRuleStore,
      investigationStore: defaultInvestigationStore,
      feedStore,
    }));
    app.use('/api/chat', createChatRouter({
      dashboardStore: defaultDashboardStore,
      conversationStore: defaultConversationStore,
      investigationReportStore: defaultInvestigationReportStore,
      alertRuleStore: defaultAlertRuleStore,
      investigationStore: defaultInvestigationStore,
    }));
    app.use('/api/alert-rules', createAlertRulesRouter({
      alertRuleStore: defaultAlertRuleStore,
      investigationStore: defaultInvestigationStore,
      feedStore,
      reportStore: defaultInvestigationReportStore,
    }));
    app.use('/api/folders', createFolderRouter(defaultFolderStore));
    app.use('/api/search', createSearchRouter({
      dashboardStore: defaultDashboardStore,
      alertRuleStore: defaultAlertRuleStore,
      folderStore: defaultFolderStore,
    }));
    app.use('/api/versions', createVersionRouter(defaultVersionStore));
  }

  mountStaticAssets(app);

  // 404 for unmatched routes
  app.use(notFoundHandler);

  // Centralized error handler (must be last)
  app.use(errorHandler);

  return app;
}

export function startServer(port = 3000): void {
  const app = createApp();
  const shutdown = new GracefulShutdown();
  const useSqlite = !process.env['DATABASE_URL'];

  if (!useSqlite) {
    // Legacy in-memory mode: load JSON persistence
    void (async () => {
      const { setMarkDirty } = await import('@agentic-obs/data-layer');
      setMarkDirty(markDirty);

      registerStore('dashboards', defaultDashboardStore);
      registerStore('alertRules', defaultAlertRuleStore);
      registerStore('conversations', defaultConversationStore);
      registerStore('investigationReports', defaultInvestigationReportStore);
      registerStore('investigations', defaultInvestigationStore);
      registerStore('shares', defaultShareStore);
      registerStore('notifications', defaultNotificationStore);
      registerStore('folders', defaultFolderStore);
      await loadAll();
      log.info('Persisted store data loaded');
    })().catch((err) => {
      log.error({ err: err instanceof Error ? err.message : err }, 'failed to load persisted stores');
    });
  }

  // Wrap Express app in httpServer + attach Socket.io WebSocket gateway
  void import('./websocket/gateway.js').then(({ createWebSocketGateway }) => {
    const { httpServer, gateway } = createWebSocketGateway(app);

    httpServer.listen(port, () => {
      log.info({ port }, 'API gateway listening');
    });

    // -- Shutdown hooks (in priority order)
    shutdown.register({
      name: 'http-server',
      priority: ShutdownPriority.STOP_HTTP_SERVER,
      timeoutMs: 5_000,
      handler: () => new Promise((resolve, reject) => {
        httpServer.close((err) => err ? reject(err) : resolve(undefined));
      }),
    });

    shutdown.register({
      name: 'websocket-gateway',
      priority: ShutdownPriority.STOP_HTTP_SERVER,
      timeoutMs: 5_000,
      handler: () => gateway.close(),
    });

    // Flush in-memory stores to disk only in legacy mode
    if (!useSqlite) {
      shutdown.register({
        name: 'persistence-flush',
        priority: ShutdownPriority.STOP_WORKERS,
        timeoutMs: 5_000,
        handler: () => flushStores(),
      });
    }

    // Attach OS signal handlers
    shutdown.listen();
  }).catch((err) => {
    log.error({ err: err instanceof Error ? err.message : err }, 'websocket gateway failed to initialize');
  });
}
