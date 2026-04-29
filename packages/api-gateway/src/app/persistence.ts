/**
 * Persistence backend selection.
 *
 * The API gateway depends on repository bundles plus a small raw query runner.
 * SQLite and Postgres are implementations of that boundary; no route or
 * service should branch on the concrete database.
 */

import {
  ApiKeyRepository,
  AuditLogRepository,
  DashboardAclRepository,
  FolderRepository,
  OrgRepository,
  OrgUserRepository,
  PermissionRepository,
  PreferencesRepository,
  QuotaRepository,
  RoleRepository,
  TeamMemberRepository,
  TeamRepository,
  TeamRoleRepository,
  UserAuthRepository,
  UserAuthTokenRepository,
  UserRepository,
  UserRoleRepository,
  applyPostgresSchema,
  applySchema,
  createDbClient,
  createPostgresRepositories,
  createSqliteClient,
  createSqliteRepositories,
  postgresAuth,
} from '@agentic-obs/data-layer';
import type { QueryClient, SqliteRepositories } from '@agentic-obs/data-layer';
import type {
  IApiKeyRepository,
  IAuditLogRepository,
  IDashboardAclRepository,
  IFolderRepository,
  IOrgRepository,
  IOrgUserRepository,
  IPermissionRepository,
  IPreferencesRepository,
  IQuotaRepository,
  IRoleRepository,
  ITeamMemberRepository,
  ITeamRepository,
  ITeamRoleRepository,
  IUserAuthRepository,
  IUserAuthTokenRepository,
  IUserRepository,
  IUserRoleRepository,
} from '@agentic-obs/common';
import { createLogger } from '@agentic-obs/common/logging';
import { dbPath } from '../paths.js';

const log = createLogger('persistence');

export type PersistenceBackend = 'sqlite' | 'postgres';

export interface AuthRepositoryBundle {
  users: IUserRepository;
  userAuth: IUserAuthRepository;
  userAuthTokens: IUserAuthTokenRepository;
  orgs: IOrgRepository;
  orgUsers: IOrgUserRepository;
  auditLog: IAuditLogRepository;
  apiKeys: IApiKeyRepository;
  preferences: IPreferencesRepository;
}

export interface RbacRepositoryBundle {
  roles: IRoleRepository;
  permissions: IPermissionRepository;
  userRoles: IUserRoleRepository;
  teamRoles: ITeamRoleRepository;
  teamMembers: ITeamMemberRepository;
  folders: IFolderRepository;
  dashboardAcl: IDashboardAclRepository;
  quotas: IQuotaRepository;
  teams: ITeamRepository;
}

export interface Persistence {
  backend: PersistenceBackend;
  db: QueryClient;
  repos: SqliteRepositories;
  authRepos: AuthRepositoryBundle;
  rbacRepos: RbacRepositoryBundle;
}

function isPostgresUrl(
  url: string | undefined,
): url is `postgres://${string}` | `postgresql://${string}` {
  return (
    typeof url === 'string' &&
    (url.startsWith('postgres://') || url.startsWith('postgresql://'))
  );
}

function createSqliteAuthRepositories(db: QueryClient): AuthRepositoryBundle {
  return {
    users: new UserRepository(db as never),
    userAuth: new UserAuthRepository(db as never),
    userAuthTokens: new UserAuthTokenRepository(db as never),
    orgs: new OrgRepository(db as never),
    orgUsers: new OrgUserRepository(db as never),
    auditLog: new AuditLogRepository(db as never),
    apiKeys: new ApiKeyRepository(db as never),
    preferences: new PreferencesRepository(db as never),
  };
}

function createSqliteRbacRepositories(db: QueryClient): RbacRepositoryBundle {
  return {
    roles: new RoleRepository(db as never),
    permissions: new PermissionRepository(db as never),
    userRoles: new UserRoleRepository(db as never),
    teamRoles: new TeamRoleRepository(db as never),
    teamMembers: new TeamMemberRepository(db as never),
    folders: new FolderRepository(db as never),
    dashboardAcl: new DashboardAclRepository(db as never),
    quotas: new QuotaRepository(db as never),
    teams: new TeamRepository(db as never),
  };
}

function createPostgresAuthRepositories(db: QueryClient): AuthRepositoryBundle {
  return {
    users: new postgresAuth.UserRepository(db as never),
    userAuth: new postgresAuth.UserAuthRepository(db as never),
    userAuthTokens: new postgresAuth.UserAuthTokenRepository(db as never),
    orgs: new postgresAuth.OrgRepository(db as never),
    orgUsers: new postgresAuth.OrgUserRepository(db as never),
    auditLog: new postgresAuth.AuditLogRepository(db as never),
    apiKeys: new postgresAuth.ApiKeyRepository(db as never),
    preferences: new postgresAuth.PreferencesRepository(db as never),
  };
}

function createPostgresRbacRepositories(db: QueryClient): RbacRepositoryBundle {
  return {
    roles: new postgresAuth.RoleRepository(db as never),
    permissions: new postgresAuth.PermissionRepository(db as never),
    userRoles: new postgresAuth.UserRoleRepository(db as never),
    teamRoles: new postgresAuth.TeamRoleRepository(db as never),
    teamMembers: new postgresAuth.TeamMemberRepository(db as never),
    folders: new postgresAuth.FolderRepository(db as never),
    dashboardAcl: new postgresAuth.DashboardAclRepository(db as never),
    quotas: new postgresAuth.QuotaRepository(db as never),
    teams: new postgresAuth.TeamRepository(db as never),
  };
}

function buildSqlite(): Persistence {
  const db = createSqliteClient({ path: dbPath() });
  applySchema(db);
  return {
    backend: 'sqlite',
    db,
    repos: createSqliteRepositories(db),
    authRepos: createSqliteAuthRepositories(db),
    rbacRepos: createSqliteRbacRepositories(db),
  };
}

async function buildPostgres(url: string): Promise<Persistence> {
  const poolSize = Number(process.env['DATABASE_POOL_SIZE'] ?? '10');
  const db = createDbClient({
    url,
    poolSize: Number.isFinite(poolSize) && poolSize > 0 ? poolSize : undefined,
    ssl: process.env['DATABASE_SSL'] === 'true' || process.env['DATABASE_SSL'] === '1',
  });
  await applyPostgresSchema(db);
  return {
    backend: 'postgres',
    db,
    repos: createPostgresRepositories(db),
    authRepos: createPostgresAuthRepositories(db),
    rbacRepos: createPostgresRbacRepositories(db),
  };
}

export interface PersistenceConfig {
  /** Read from `process.env.DATABASE_URL` when undefined. */
  databaseUrl?: string | undefined;
}

export async function createPersistence(
  config: PersistenceConfig = {},
): Promise<Persistence> {
  const dbUrl = config.databaseUrl ?? process.env['DATABASE_URL'];

  if (dbUrl && !isPostgresUrl(dbUrl)) {
    log.warn(
      { dbUrl: dbUrl.slice(0, 12) },
      'DATABASE_URL is set but does not start with postgres://; using SQLite',
    );
  }

  if (isPostgresUrl(dbUrl)) {
    return buildPostgres(dbUrl);
  }
  return buildSqlite();
}
