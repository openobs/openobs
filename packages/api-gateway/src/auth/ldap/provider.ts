/**
 * LdapProvider — orchestrates admin-bind → user-search → re-bind → group
 * mapping → user upsert.
 *
 * Server configs iterated in order; first server that finds the user wins.
 * Failure to bind as the user = invalidCredentials (same 401 as local-auth).
 */

import {
  AuthError,
  type IOrgUserRepository,
  type IUserRepository,
  type OrgRole,
  type User,
} from '@agentic-obs/common';
import type { LdapConfig } from './config.js';
import { authenticate, type LdapUserRecord } from './client.js';
import { mapGroupsToRoles } from './group-mapping.js';

export interface LdapLoginInput {
  user: string;
  password: string;
}

export interface LdapLoginResult {
  user: User;
  record: LdapUserRecord;
  orgRoles: Map<string, OrgRole>;
  isServerAdmin: boolean;
}

export interface LdapProviderDeps {
  users: IUserRepository;
  orgUsers: IOrgUserRepository;
  defaultOrgId: string;
}

export class LdapProvider {
  constructor(
    private readonly cfg: LdapConfig,
    private readonly deps: LdapProviderDeps,
  ) {}

  async login(input: LdapLoginInput): Promise<LdapLoginResult> {
    if (!input.user || !input.password) {
      throw AuthError.invalidCredentials();
    }
    for (const server of this.cfg.servers) {
      const rec = await authenticate(server, {
        login: input.user,
        password: input.password,
      }).catch(() => null);
      if (!rec) continue;
      const mapping = mapGroupsToRoles(rec.groupDns, server.groupMappings);
      const user = await this.upsertUser(rec, mapping.isServerAdmin);
      await this.syncOrgMemberships(user.id, mapping.orgRoles);
      return {
        user,
        record: rec,
        orgRoles: mapping.orgRoles,
        isServerAdmin: mapping.isServerAdmin,
      };
    }
    throw AuthError.invalidCredentials();
  }

  private async upsertUser(
    rec: LdapUserRecord,
    isServerAdmin: boolean,
  ): Promise<User> {
    const existing =
      (await this.deps.users.findByLogin(rec.username)) ??
      (rec.email ? await this.deps.users.findByEmail(rec.email) : null);
    if (existing) {
      const updated = await this.deps.users.update(existing.id, {
        name: rec.name || existing.name,
        email: rec.email || existing.email,
        isAdmin: isServerAdmin || existing.isAdmin,
      });
      return updated ?? existing;
    }
    return this.deps.users.create({
      login: rec.username,
      name: rec.name,
      email: rec.email,
      orgId: this.deps.defaultOrgId,
      emailVerified: true,
      isAdmin: isServerAdmin,
    });
  }

  private async syncOrgMemberships(
    userId: string,
    roles: Map<string, OrgRole>,
  ): Promise<void> {
    for (const [orgId, role] of roles.entries()) {
      const membership = await this.deps.orgUsers.findMembership(orgId, userId);
      if (membership) {
        if (membership.role !== role) {
          await this.deps.orgUsers.updateRole(orgId, userId, role);
        }
      } else {
        await this.deps.orgUsers.create({ orgId, userId, role });
      }
    }
  }
}
