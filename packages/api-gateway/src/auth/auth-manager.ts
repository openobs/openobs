/**
 * Auth subsystem wiring.
 *
 * Factory that takes the auth repositories and returns a ready-to-use set of
 * services (SessionService, LocalProvider, AuditWriter, optional OAuth/LDAP/SAML
 * providers). `server.ts` calls `createAuthSubsystem` once at boot and passes
 * the result to the auth + user routers and middleware.
 *
 * This replaces the old monolithic AuthManager. No JWT-in-body flow; cookies
 * only. No back-compat shims.
 */

import type {
  IApiKeyRepository,
  IAuditLogRepository,
  IOrgRepository,
  IOrgUserRepository,
  IUserAuthRepository,
  IUserAuthTokenRepository,
  IUserRepository,
} from '@agentic-obs/common';
import { AuditWriter, startAuditPruneCron, auditRetentionDays } from './audit-writer.js';
import { LocalProvider } from './local-provider.js';
import {
  SessionService,
  sessionOptionsFromEnv,
  startSessionPruneCron,
} from './session-service.js';
import {
  GenericOidcProvider,
  GitHubProvider,
  GoogleProvider,
  loadGenericOidcConfig,
  loadGitHubConfig,
  loadGoogleConfig,
} from './oauth/index.js';
import { LdapProvider } from './ldap/provider.js';
import { ldapEnabled, ldapConfigPath, loadLdapConfig } from './ldap/config.js';
import { SamlProvider } from './saml/provider.js';
import { loadSamlConfig } from './saml/config.js';

export interface SessionServiceDeps {
  userAuthTokens: IUserAuthTokenRepository;
}

export interface AuthSubsystemRepos {
  users: IUserRepository;
  userAuth: IUserAuthRepository;
  userAuthTokens: IUserAuthTokenRepository;
  orgs: IOrgRepository;
  orgUsers: IOrgUserRepository;
  auditLog: IAuditLogRepository;
  apiKeys: IApiKeyRepository;
}

export interface AuthSubsystem {
  sessions: SessionService;
  local: LocalProvider;
  audit: AuditWriter;
  github: GitHubProvider | null;
  google: GoogleProvider | null;
  generic: GenericOidcProvider | null;
  ldap: LdapProvider | null;
  saml: SamlProvider | null;
  stop: () => void;
}

export async function createAuthSubsystem(
  repos: AuthSubsystemRepos,
  options: { defaultOrgId?: string } = {},
): Promise<AuthSubsystem> {
  const defaultOrgId = options.defaultOrgId ?? 'org_main';

  const sessions = new SessionService(
    repos.userAuthTokens,
    sessionOptionsFromEnv(),
  );
  const local = new LocalProvider(repos.users);
  const audit = new AuditWriter(repos.auditLog);

  const githubCfg = loadGitHubConfig();
  const googleCfg = loadGoogleConfig();
  const genericCfg = await loadGenericOidcConfig().catch(() => null);

  const github = githubCfg ? new GitHubProvider(githubCfg) : null;
  const google = googleCfg ? new GoogleProvider(googleCfg) : null;
  const generic = genericCfg ? new GenericOidcProvider(genericCfg) : null;

  let ldap: LdapProvider | null = null;
  if (ldapEnabled()) {
    const cfg = await loadLdapConfig(ldapConfigPath());
    if (cfg) {
      ldap = new LdapProvider(cfg, {
        users: repos.users,
        orgUsers: repos.orgUsers,
        defaultOrgId,
      });
    }
  }

  let saml: SamlProvider | null = null;
  const samlCfg = loadSamlConfig();
  if (samlCfg) {
    saml = new SamlProvider(samlCfg, {
      users: repos.users,
      userAuth: repos.userAuth,
      defaultOrgId,
    });
  }

  const stopSession = startSessionPruneCron(sessions);
  const stopAudit = startAuditPruneCron(
    repos.auditLog,
    auditRetentionDays(),
  );
  const stop = () => {
    stopSession();
    stopAudit();
  };

  return { sessions, local, audit, github, google, generic, ldap, saml, stop };
}
